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

from lichessapi import LichessAPI
from basehandler import BaseHandler

from version import __version__, __revision__

base_path = os.path.abspath(os.path.dirname(__file__))
os.chdir(base_path)


class HomeHandler(BaseHandler):
    @tornado.web.authenticated
    def get(self) -> None:
        self.render('home.html')


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
