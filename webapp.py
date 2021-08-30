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
from pathlib import Path
from datetime import datetime, timedelta

from typing import cast, Any, ClassVar, Dict, List, Optional, Tuple, Sequence

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornado.auth
from tornado.httpclient import AsyncHTTPClient
from tornado.options import define, options, parse_config_file, parse_command_line
import tornado.escape

from tinydb import TinyDB, Query

from lichessapi import LichessAPI
from basehandler import BaseHandler

from version import __version__, __revision__

base_path = os.path.abspath(os.path.dirname(__file__))
os.chdir(base_path)


def get_next_monday(d: datetime) -> datetime:
    monday = d + timedelta(days=(7 - d.weekday()))
    return datetime(monday.year, monday.month, monday.day)


class HomeHandler(BaseHandler):
    @tornado.web.authenticated
    async def get(self) -> None:
        table = self.db.table('templates')
        T = Query()
        templates = table.search((T.user == self.current_user['id']) & (T.tournament_set == 'default'))
        table = self.db.table('tournaments')
        tournaments = table.search((T.user == self.current_user['id']) & (T.tournament_set == 'default'))

        #self.write(await self.lichess.get_tournament(self.token, 'swiss', 'ADqbMiXP', self.options.team_id))
        #self.write(await self.lichess.get_tournament(self.token, 'arena', 'tDqVoGA6'))

        self.render(
            'home.html',
            templates=templates,
            tournaments=tournaments,
            datetime=datetime,
            timedelta=timedelta,
            next_monday=get_next_monday(datetime.utcnow()),
            xsrf_token=self.xsrf_token
            )


class AddHandler(BaseHandler):
    @tornado.web.authenticated
    async def get(self) -> None:
        self.render(
            'add.html',
            errors=[]
            )

    @tornado.web.authenticated
    async def post(self) -> None:
        errors = []
        template_tournament_url = self.get_argument('tournament')
        if not template_tournament_url:
            errors.append('No tournament URL')
            self.render('add.html', errors=errors)
            return
        cheme, netloc, path, query, fragment = urlsplit(template_tournament_url)
        paths = path.split('/')
        if netloc != 'lichess.org' or len(paths) < 2:
            errors.append('Invalid tournament URL')
        else:
            id = paths[-1]
            if paths[-2] == 'tournament':
                type = 'arena'
            elif paths[-2] == 'swiss':
                type = 'swiss'
            else:
                errors.append('Invalid tournament type')
        if errors:
            self.render('add.html', errors=errors)
            return
        tournament = await self.lichess.get_tournament(self.token, type, id, self.options.team_id)  # type: ignore[has-type] # noqa: E501
        logging.debug(f"Adding template tournament: {tournament}")

        if type == 'arena':
            t = {
                'type': type,
                'name': cast(str, tournament.get('fullName'))[:-6],
                'clockTime': tournament.get('clock', {}).get('limit'),
                'clockIncrement': tournament.get('clock', {}).get('increment'),
                'minutes': tournament.get('minutes'),
                'startDate': datetime.fromisoformat(tournament.get('startsAt').strip('Z')).timestamp(),
                'variant': tournament.get('variant'),
                'rated': bool(self.get_argument('rated')),
                'berserkable': bool(self.get_argument('berserkable')),
                'streakable': bool(self.get_argument('streakable')),
                'hasChat': bool(self.get_argument('chat')),
                'description': tournament.get('description'),
                'password': self.get_argument('password', ''),
                'conditions.teamMember.teamId': self.get_argument('team', ''),
                'conditions.minRating.rating': int(self.get_argument('min_rating') or -1),
                'conditions.maxRating.rating': int(self.get_argument('max_rating') or -1),
                'conditions.nbRatedGame.nb': int(self.get_argument('rated_games') or -1),
            }
        t.update({
            'id': token_urlsafe(),
            'user': self.current_user['id'],
            'tournament_set': 'default'
        })
        table = self.db.table('templates')
        table.insert(t)
        self.redirect('/')
        return


class CreateHandler(BaseHandler):
    @tornado.web.authenticated
    async def post(self) -> None:
        week = datetime.fromtimestamp(float(self.get_argument('week')))
        T = Query()
        table = self.db.table('templates')
        tournaments = table.search((T.user == self.current_user['id']) & (T.tournament_set == 'default'))
        templates = []
        for tournament in tournaments:
            template = dict(tournament)
            if template['type'] == 'arena':
                if template['conditions.minRating.rating'] == -1:
                    del template['conditions.minRating.rating']
                if template['conditions.maxRating.rating'] == -1:
                    del template['conditions.maxRating.rating']
                if template['conditions.nbRatedGame.nb'] == -1:
                    del template['conditions.nbRatedGame.nb']
                if not template['password']:
                    del template['password']
                start_date = datetime.fromtimestamp(template['startDate'])
                start_offset = get_next_monday(start_date) - start_date
                template['startDate'] = int((get_next_monday(week) - start_offset).timestamp())*1000
            templates.append(template)
            print(template)
        req = [self.lichess.create_tournament(self.token, template['type'], template) for template in templates]
        res = await gather(*req)
        for t, r in zip(tournaments, res):
            r.update({
                'user': self.current_user['id'],
                'tournament_set': 'default',
                'template': t.get('id')
            })
        table = self.db.table('tournaments')
        table.insert_multiple(res)
        print(res)
        self.render(
            'tournaments.html',
            tournaments=zip(tournaments, res)
        )


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
    define("team_id", type=str)
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
    (r"/add", AddHandler),
    (r"/create", CreateHandler),
    (r"/login", LoginHandler),
]
application = tornado.web.Application(urls, **settings)  # type: ignore [arg-type]


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
