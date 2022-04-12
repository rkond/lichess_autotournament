from datetime import datetime, timedelta
from json import loads, dumps
from math import floor
from secrets import token_urlsafe
from typing import Any, Dict, cast
from asyncio import gather
from lichessapi import LichessError

from tinydb import Query
import tornado

from tornado.web import HTTPError

from basehandler import BaseAPIHandler


class TournamentTemplateHandler(BaseAPIHandler):
    ALLOWED_FIELDS = {
        'arena':
        ('id', 'type', 'name', 'clockTime', 'clockIncrement', 'minutes', 'startDate',
         'variant', 'rated', 'berserkable', 'streakable', 'hasChat',
         'description', 'password', 'conditions.teamMember.teamId',
         'conditions.minRating.rating', 'conditions.maxRating.rating',
         'conditions.nbRatedGame.nb')
    }

    @staticmethod
    def convert_clock_time(seconds: int) -> str:
        minutes = seconds/60
        if minutes == floor(minutes):
            return f'{int(minutes)}'
        if minutes*10 == floor(minutes*10):
            return f'{minutes:.1f}'
        return f'{minutes:.2f}'

    @classmethod
    def filter_allowed_fields(cls, tournament: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in tournament.items() if k in cls.ALLOWED_FIELDS[tournament['type']]} if tournament['type'] in cls.ALLOWED_FIELDS else {}  # noqa: E501

    @tornado.web.authenticated  # type: ignore[misc]
    def get(self, id: str) -> None:
        table = self.db.table('templates')
        T = Query()
        if id:
            template = table.get((T.user == self.current_user['id'])
                                 & (T.tournament_set == 'default')
                                 & (T.id == id))
            if not template:
                raise HTTPError(
                    404,
                    f"No template with id \"{id}\" for user: \"{self.current_user['id']}\""
                )
            template = self.filter_allowed_fields(template)
            template['clockTime'] = self.convert_clock_time(template["clockTime"])
            self.write(dumps({'tournament': self.filter_allowed_fields(template), 'success': True}))
        else:
            templates = table.search((T.user == self.current_user['id'])
                                     & (T.tournament_set == 'default'))
            res = [self.filter_allowed_fields(t) for t in templates]
            for t in res:
                t['clockTime'] = self.convert_clock_time(t["clockTime"])
            self.write(dumps({'templates': res, 'success': True}))

    @tornado.web.authenticated  # type: ignore[misc]
    def post(self, id: str) -> None:
        value = {}
        try:
            value = self.filter_allowed_fields(loads(self.request.body.decode()))
        except ValueError:
            raise HTTPError(400, "Invalid JSON")
        value['id'] = token_urlsafe()
        value['user'] = self.current_user['id']
        value['tournament_set'] = 'default'
        value['clockTime'] = int(float(value['clockTime'])*60)
        table = self.db.table('templates')
        table.insert(value)
        self.write(dumps({'success': True, 'id': value['id']}))

    @tornado.web.authenticated  # type: ignore[misc]
    def patch(self, id: str) -> None:
        value = {}
        try:
            value = self.filter_allowed_fields(loads(self.request.body.decode()))
        except ValueError:
            raise HTTPError(400, "Invalid JSON")
        value['id'] = id
        value['user'] = self.current_user['id']
        value['tournament_set'] = 'default'
        value['clockTime'] = int(float(value['clockTime'])*60)
        table = self.db.table('templates')
        T = Query()
        u = table.update(value, (T.user == self.current_user['id']) & (T.id == id) & (T.tournament_set == 'default'))
        self.write(dumps({'success': bool(u)}))

    @tornado.web.authenticated  # type: ignore[misc]
    def delete(self, id: str) -> None:
        T = Query()
        table = self.db.table('templates')
        u = table.remove((T.user == self.current_user['id']) & (T.id == id) & (T.tournament_set == 'default'))
        self.write(dumps({'success': bool(u)}))


def get_this_monday(d: datetime) -> datetime:
    monday = d + timedelta(days=-d.weekday())
    return datetime(monday.year, monday.month, monday.day)


class TournamentCreateHandler(BaseAPIHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self) -> None:
        T = Query()
        table = self.db.table('tournaments')
        tournaments = table.search((T.user == self.current_user['id']) & (T.tournament_set == 'default'))
        tournaments.sort(key=lambda t: t.get('created', 0), reverse=True)
        self.write(dumps({'success': True, 'tournaments': tournaments}))

    @tornado.web.authenticated  # type: ignore[misc]
    async def post(self) -> None:
        request = {}
        week = None
        try:
            request = loads(self.request.body.decode())
            week = datetime.utcfromtimestamp(cast(float, request.get('week')))
        except ValueError:
            raise HTTPError(400, "Invalid JSON")

        T = Query()
        table = self.db.table('templates')
        if not request.get('templates'):
            templates = table.search((T.user == self.current_user['id']) & (T.tournament_set == 'default'))
        else:
            templates = table.search(
                (T.user == self.current_user['id']) &
                (T.tournament_set == 'default') &
                (T.id.one_of(request.get('templates'))))
        processed_templates = []
        errors = []
        for t in templates:
            template = dict(t)
            if template.get('type') == 'arena':
                if template['conditions.minRating.rating'] <= 0:
                    del template['conditions.minRating.rating']
                if template['conditions.maxRating.rating'] <= 0:
                    del template['conditions.maxRating.rating']
                if template['conditions.nbRatedGame.nb'] <= 0:
                    del template['conditions.nbRatedGame.nb']
                if not template['password']:
                    del template['password']

                start_date = datetime.utcfromtimestamp(template['startDate'] - (template['startDate'] % 60))
                start_offset = start_date - get_this_monday(start_date)
                tournamentStart = get_this_monday(week) + start_offset
                if tournamentStart <= datetime.utcnow():
                    errors.append(f"Cannot create tournament {template['name']} as it would start in the past")
                    continue
                template['startDate'] = int(tournamentStart.timestamp())*1000
            processed_templates.append(template)
        req = [
            self.lichess.create_tournament(self.token, template['type'], template)
            for template in processed_templates]
        result = await gather(*req, return_exceptions=True)
        created = []
        reply = {}
        for t, r in zip(processed_templates, result):
            if isinstance(r, dict):
                c = dict(r)
                c.update({
                    'user': self.current_user['id'],
                    'tournament_set': 'default',
                    'template': t.get('id'),
                    'password': t.get('password'),
                    'created': datetime.utcnow().timestamp()
                })
                created.append(c)
                reply[t.get('id')] = dict(r)
                reply[t.get('id')]['success'] = True
                reply[t.get('id')]['password'] = t.get('password')
            elif isinstance(r, LichessError):
                reply[t.get('id')] = {'success': False, 'error': r.message}
            else:
                reply[t.get('id')] = {'success': False, 'error': "Internal error"}

        table = self.db.table('tournaments')
        table.insert_multiple(created)
        self.write(dumps({'success': True, 'created': reply}))
