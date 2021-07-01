import logging
import os
import pwd
import grp
from asyncio import gather
from urllib.parse import urlencode, urlsplit, urlunsplit
from secrets import token_urlsafe
from hashlib import sha256
from base64 import urlsafe_b64encode
from json import dumps, loads

from typing import cast, Any, ClassVar, Dict, List, Optional, Tuple, Sequence

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornado.auth
from tornado.httpclient import AsyncHTTPClient
from tornado.options import define, options, parse_config_file, parse_command_line
import tornado.escape

from version import __version__, __revision__

base_path = os.path.abspath(os.path.dirname(__file__))
os.chdir(base_path)


class LichessAPI():
    _OAUTH_AUTHORIZE_URL = 'https://lichess.org/oauth'
    _OAUTH_ACCESS_TOKEN_URL = 'https://lichess.org/api/token'
    _ACCOUNT_URL = 'https://lichess.org/api/account'
    _EMAIL_URL = 'https://lichess.org/api/account/email'

    def __init__(self, client_id: str, redirect_uri: str):
        self.client_id = client_id
        self.redirect_uri = redirect_uri
        self.http = AsyncHTTPClient(force_instance=True)

    def __del__(self) -> None:
        self.http.close()

    def get_authorize_url(self,  scope: List[str], state: Optional[str] = None) -> Tuple[str, str]:
        code_verifier = token_urlsafe(64)
        # Have to trim the trailing =
        code_challenge = urlsafe_b64encode(sha256(code_verifier.encode('ascii')).digest()).decode().strip('=')
        args = {
            'response_type': 'code',
            'redirect_uri': self.redirect_uri,
            'client_id': self.client_id,
            'scope': " ".join(scope),
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256'
        }
        if state is not None:
            args['state'] = state
        return f'{self._OAUTH_AUTHORIZE_URL}/?{urlencode(args)}', code_verifier

    async def get_access_token(self, code: str, code_verifier: str) -> str:
        res = await self.http.fetch(
            self._OAUTH_ACCESS_TOKEN_URL,
            method='POST',
            headers={
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body=urlencode({
                'grant_type': 'authorization_code',
                'code': code,
                'code_verifier': code_verifier,
                'redirect_uri': f'{options.base_url}/login',
                'client_id': options.lichess_client_id
            }),
            raise_error=False)
        if res.code == 200:
            return cast(str, loads(res.body.decode())['access_token'])
        elif res.code == 400:
            raise RuntimeError(f"Bad Lichess Request: {res.body.decode() if res.body else ''}")
        else:
            raise RuntimeError(f"Error in Lichess Request: {res.code} {res.body.decode() if res.body else ''}")

    async def get_current_user(self, token: str) -> Dict[str, Any]:
        account_request = self.http.fetch(
            self._ACCOUNT_URL,
            method='GET',
            headers={
                'Authorization': f' Bearer {token}'
            })
        email_request = self.http.fetch(
            self._EMAIL_URL,
            method='GET',
            headers={
                'Authorization': f' Bearer {token}'
            })
        user, email = [loads(res.body.decode()) for res in await gather(account_request, email_request)]
        user.update(email)
        return cast(Dict[str, Any], user)


class BaseHandler(tornado.web.RequestHandler):
    @property
    def lichess(self) -> LichessAPI:
        return cast(LichessAPI, self.settings['lichess'])

    async def prepare(self) -> None:
        token = (self.get_secure_cookie('t') or b'').decode()
        if token:
            try:
                self._current_user = await self.lichess.get_current_user(token)
            except Exception as e:
                logging.warning(f"Cannot get current user: {e}")
                self.clear_cookie('t')

    def get_login_url(self) -> str:
        return "/login"


class HomeHandler(BaseHandler):

    @tornado.web.authenticated
    def get(self) -> None:
        self.write(str(self.current_user))


class LoginHandler(BaseHandler):
    async def get(self) -> None:
        if not self.get_argument('code', None):
            auth_url, code_verifier = self.lichess.get_authorize_url(
                scope=['tournament:write', 'email:read'],
                state=self.get_argument('next', '/')
            )
            self.set_secure_cookie('cv', code_verifier)
            self.redirect(auth_url)
        else:
            code_verifier = (self.get_secure_cookie('cv') or b'').decode()
            self.clear_cookie('cv')
            token = await self.lichess.get_access_token(
                self.get_argument('code'),
                code_verifier)
            self.set_secure_cookie('t', token)
            next = self.get_argument('state', '/')
            s = urlsplit(next)
            if s.hostname or s.scheme or s.username or s.password:
                next = '/'
            self.redirect(next)


def define_options() -> None:
    define("config", default="/etc/lichess/tournaments.conf")
    define("template_path", default=os.path.normpath(os.path.join(base_path, 'templates')))
    define("static_path", default=os.path.realpath(os.path.join(base_path, 'static')))

    define("user", default=None)
    define("group", default=None)

    define("debug", type=bool, default=False)
    define("bind", default="127.0.0.1")
    define("port", type=int, default=14742)
    define("base_url", type=str)

    define("lichess_client_id", type=str, default='eaade028-da6e-11eb-b2d8-ab4b0acb0c63')

    define('cookie_secret', type=str)


define_options()
parse_command_line()
parse_config_file(options.config)

if not options.base_url:
    options.base_url = f'http://localhost:{options.port}'

settings = {
    'template_path': options.template_path,
    'debug': options.debug,
    'autoescape': tornado.escape.xhtml_escape,
    'options': options,
    'xheaders': True,
    'static_path': options.static_path,
    'cookie_secret': options.cookie_secret,
    'xsrf_cookies': True,
    'lichess': LichessAPI(options.lichess_client_id, f'{options.base_url}/login')
}

urls = [
    (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": options.static_path}),
    (r"/", HomeHandler),
    (r"/login", LoginHandler),
]
application = tornado.web.Application(urls, **settings)  # type: ignore [arg-type]


def run() -> None:
    logging.info(f'Starting server v. {__version__}.{__revision__}')
    server = tornado.httpserver.HTTPServer(application, xheaders=True)
    server.listen(options.port, options.bind)
    logging.info(f'Listening on : {options.bind}:{options.port} ')
    logging.info(f'Logging : {options.logging} ; Debug : {options.debug}')

    if options.group:
        logging.info(f"Dropping privileges to group: {options.group}/{grp.getgrnam(options.group)[2]}")
        os.setgid(grp.getgrnam(options.group)[2])
    if options.user:
        os.initgroups(options.user, pwd.getpwnam(options.user)[3])
        logging.info(f"Dropping privileges to user: {options.user}/{pwd.getpwnam(options.user)[2]}")
        os.setuid(pwd.getpwnam(options.user)[2])

    tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':
    run()
