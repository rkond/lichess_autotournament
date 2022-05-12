import json
import logging
import os
import pwd
import grp
from asyncio import gather
from urllib.parse import urlsplit
from secrets import token_urlsafe
from pathlib import Path
from datetime import datetime, timedelta

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornado.auth
from tornado.options import define, options, parse_config_file, parse_command_line
import tornado.escape

from tinydb import TinyDB, Query

from lichessapi import LichessAPI
from basehandler import BaseHandler, BaseAPIHandler
from diplomas import DiplomaTemplateHandler
from tournaments import TournamentTemplateHandler, TournamentCreateHandler

from version import __version__, __revision__

base_path = os.path.abspath(os.path.dirname(__file__))
os.chdir(base_path)


def get_this_monday(d: datetime) -> datetime:
    monday = d + timedelta(days=-d.weekday())
    return datetime(monday.year, monday.month, monday.day)


class TournamentAPI(BaseAPIHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self) -> None:
        tournament_url = self.get_argument('tournament')
        scheme, netloc, path, query, fragment = urlsplit(tournament_url)
        paths = path.split('/')
        if netloc != 'lichess.org' or len(paths) < 2:
            raise tornado.web.HTTPError(400, "Invalid tournament URL")
        else:
            id = paths[-1]
            if paths[-2] == 'tournament':
                type = 'arena'
            elif paths[-2] == 'swiss':
                type = 'swiss'
            else:
                raise tornado.web.HTTPError(400, "Invalid tournament type")
        tournament = await self.lichess.get_tournament(self.token, type, id)
        if type == 'arena':
            players = await gather(*[self.lichess.get_user(self.token, player['name']) for player in tournament['standing']['players']])  # noqa: E501
            for p, player in zip(tournament['standing']['players'], players):
                p['profile'] = player.get('profile', {})
        tournament['success'] = True
        tournament['type'] = type
        self.write(json.dumps(tournament))


class TeamsAPI(BaseAPIHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self) -> None:
        self.write(json.dumps({
            'success': True,
            'teams': [
                team for team in
                await self.lichess.get_user_teams(self.token, self.current_user['username'])
                if any(self.current_user['id'] == leader['id'] for leader in team['leaders'])]}))


class HomeHandler(BaseHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self) -> None:
        table = self.db.table('templates')
        T = Query()
        templates = table.search((T.user == self.current_user['id']) & (T.tournament_set == 'default'))
        table = self.db.table('tournaments')
        tournaments = table.search((T.user == self.current_user['id']) & (T.tournament_set == 'default'))
        table = self.db.table('diploma_templates')
        diploma_templates = table.search(T.user == self.current_user['id'])

        self.render(
            'home.html',
            templates=templates,
            tournaments=tournaments,
            diploma_templates=diploma_templates,
            datetime=datetime,
            timedelta=timedelta,
            this_monday=get_this_monday(datetime.utcnow()),
            xsrf_token=self.xsrf_token
            )


class DiplomasHandler(BaseHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self, command: str, id: str = '') -> None:
        if command == 'delete':
            self.check_xsrf_cookie()
            T = Query()
            table = self.db.table('diploma_templates')
            table.remove((T.user == self.current_user['id']) & (T.id == id))
            self.redirect('/')
        elif command == 'add':
            self.redirect(f'/diplomas/edit/{token_urlsafe(16)}')
        elif command == 'edit':
            self.render(
                'diplomas.html',
                id=id,
                errors=[],
            )
        else:
            raise tornado.web.HTTPError(404)


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
    define("db_dir", type=str, default='/var/lib/lichess-tournaments')

    define('cookie_secret', type=str)


define_options()
parse_command_line()
parse_config_file(options.config)

if not options.base_url:
    options.base_url = f'http://localhost:{options.port}'

settings = {
    'template_path': options.template_path,
    'debug': options.debug,
    'autoescape': 'xhtml_escape',
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
    (r"/diplomas/(add)", DiplomasHandler),
    (r"/diplomas/(delete)/([-a-zA-Z0-9_=]+)", DiplomasHandler),
    (r"/diplomas/(edit)/([-a-zA-Z0-9_=]+)", DiplomasHandler),
    (r"/login", LoginHandler),

    (r"/api/v1/diploma/template/([-a-zA-Z0-9_=]+)?", DiplomaTemplateHandler),
    (r"/api/v1/tournament/template/([-a-zA-Z0-9_=]*)", TournamentTemplateHandler),
    (r"/api/v1/tournament/create", TournamentCreateHandler),
    (r"/api/v1/tournament/last", TournamentCreateHandler),
    (r"/api/v1/teams", TeamsAPI),
    (r"/api/v1/tournament", TournamentAPI),
]
application = tornado.web.Application(urls, **settings)


def run() -> None:
    logging.info(f'Starting server v. {__version__}.{__revision__}')
    server = tornado.httpserver.HTTPServer(application, xheaders=True)
    server.listen(options.port, options.bind)
    logging.info(f'Listening on : {options.bind}:{options.port}')
    logging.info(f'Logging : {options.logging} ; Debug : {options.debug}')
    Path(options.db_dir).mkdir(mode=0o700, parents=True, exist_ok=True)
    gid = grp.getgrnam(options.group)[2] if options.group else os.getgid()
    uid = pwd.getpwnam(options.user)[2] if options.user else os.getuid()
    os.chown(options.db_dir, uid, gid)
    if options.group:
        logging.info(f"Dropping privileges to group: {options.group}/{gid}")
        os.setgid(gid)
    if options.user:
        os.initgroups(options.user, pwd.getpwnam(options.user)[3])
        logging.info(f"Dropping privileges to user: {options.user}/{uid}")
        os.setuid(uid)

    BaseHandler.set_db(TinyDB(f'{options.db_dir}/db.json'))

    tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':
    run()
