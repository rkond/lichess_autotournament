from datetime import datetime, timedelta
import logging
try:
    from backports.zoneinfo import ZoneInfo  # type: ignore[import]
except ModuleNotFoundError:
    from zoneinfo import ZoneInfo
from json import loads, dumps
from math import floor
from secrets import token_urlsafe
from typing import Any, Dict, List, Union, cast
from asyncio import gather
from lichessapi import LichessError

from tinydb import Query
import tornado

from tornado.web import HTTPError

from basehandler import BaseAPIHandler


def convert_clock_time(seconds: int) -> str:
    minutes = seconds/60
    if minutes == floor(minutes):
        return f'{int(minutes)}'
    if minutes*10 == floor(minutes*10):
        return f'{minutes:.1f}'
    return f'{minutes:.2f}'


# Convert old timestamp format to a new one with timezone info
def convert_start_date(startDate: Union[int, Dict[str, Union[int, str]]]) -> Dict[str, Union[int, str]]:
    if isinstance(startDate, dict):
        return startDate
    startDateTimestamp = datetime.utcfromtimestamp(startDate)
    return {
        'weekday': startDateTimestamp.weekday(),
        'wall_time': startDateTimestamp.strftime('%H:%M'),
        'timezone': 'Etc/UCT'
    }


class TournamentTemplateHandler(BaseAPIHandler):
    ALLOWED_FIELDS = {
        'arena':
        ('id', 'type', 'name', 'clockTime', 'clockIncrement', 'minutes', 'startDate',
         'variant', 'rated', 'berserkable', 'streakable', 'hasChat',
         'description', 'password', 'conditions.teamMember.teamId',
         'conditions.minRating.rating', 'conditions.maxRating.rating',
         'conditions.nbRatedGame.nb', 'index'),
        'swiss': (
         'id', 'type', 'name', 'clock.limit', 'clock.increment', 'startDate',
         'variant', 'rated', 'chatFor', 'teamId', 'nbRounds', 'roundInterval',
         'forbiddenPairings',
         'description', 'password',
         'conditions.minRating.rating', 'conditions.maxRating.rating',
         'conditions.nbRatedGame.nb', 'index'
        )
    }

    @classmethod
    def filter_allowed_fields(cls, tournament: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in tournament.items() if k in cls.ALLOWED_FIELDS[tournament['type']]} if tournament.get('type', '') in cls.ALLOWED_FIELDS else {}  # noqa: E501

    @tornado.web.authenticated  # type: ignore[misc]
    def get(self, id: str) -> None:
        table = self.db.table('templates')
        T = Query()
        if id:
            template = cast(
                Dict[str, Any],
                table.get((T.user == self.current_user['id'])
                          & (T.tournament_set == 'default')
                          & (T.id == id)))
            if not template:
                raise HTTPError(
                    404,
                    f"No template with id \"{id}\" for user: \"{self.current_user['id']}\""
                )
            template = self.filter_allowed_fields(template)
            template['clockTime'] = convert_clock_time(template['clockTime'])
            template['startDate'] = convert_start_date(template['startDate'])
            self.write(dumps({'tournament': self.filter_allowed_fields(template), 'success': True}))
        else:
            templates = table.search((T.user == self.current_user['id'])
                                     & (T.tournament_set == 'default'))
            res = [self.filter_allowed_fields(t) for t in templates]
            for t in res:
                if 'clockTime' in t:
                    t['clockTime'] = convert_clock_time(t['clockTime'])
                if 'startDate' in t:
                    t['startDate'] = convert_start_date(t['startDate'])

            res.sort(key=lambda template: template.get('index', 0))
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
        if 'clockTime' in value:
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
        if 'clockTime' in value:
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
    monday = d.date() + timedelta(days=-d.weekday())
    return datetime(monday.year, monday.month, monday.day, tzinfo=d.tzinfo)


class TournamentCreateHandler(BaseAPIHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self) -> None:
        T = Query()
        table = self.db.table('tournaments')
        tournaments = table.search((T.user == self.current_user['id']) & (T.tournament_set == 'default'))
        tournaments.sort(key=lambda t: t.get('created', 0), reverse=True)
        self.write(dumps({'success': True, 'tournaments': tournaments}))

    @staticmethod
    def get_tournament_start(template: Dict[str, Any], week: datetime) -> datetime:
        start_date_data = convert_start_date(template['startDate'])
        wall_time = datetime.strptime(cast(str, start_date_data['wall_time']), "%H:%M")
        tournament_day = (week + timedelta(days=cast(int, start_date_data['weekday']))).date()
        return datetime(
            year=tournament_day.year,
            month=tournament_day.month,
            day=tournament_day.day,
            hour=wall_time.hour,
            minute=wall_time.minute,
            tzinfo=ZoneInfo(cast(str, start_date_data['timezone'])))

    @tornado.web.authenticated  # type: ignore[misc]
    async def post(self) -> None:
        request = {}
        week = None
        try:
            request = loads(self.request.body.decode())
            week = get_this_monday(datetime.utcfromtimestamp(cast(float, request.get('week'))))
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
        errors: Dict[str, List[str]] = {}
        for _t in templates:
            template = dict(_t)
            id = template.get('id', 'Unknown template')
            try:
                tournamentStart = self.get_tournament_start(template, week)
                if tournamentStart <= datetime.utcnow().astimezone(tournamentStart.tzinfo):
                    if not errors.get(id):
                        errors[id] = []
                    errors[id].append(f"Cannot create tournament {template['name']} as it would start in the past")
                    continue
                if int(template['conditions.minRating.rating']) <= 0:
                    del template['conditions.minRating.rating']
                if int(template['conditions.maxRating.rating']) <= 0:
                    del template['conditions.maxRating.rating']
                if int(template['conditions.nbRatedGame.nb']) <= 0:
                    del template['conditions.nbRatedGame.nb']
                if not template['password']:
                    del template['password']
                table = self.db.table('tournaments')
                template['startTimestamp'] = int(tournamentStart.timestamp())
                if table.contains(
                        (T.user == self.current_user['id']) &
                        (T.tournament_set == 'default') &
                        (T.template == id) &
                        (T.startTimestamp == int(tournamentStart.timestamp()))):
                    if not errors.get(id):
                        errors[id] = []
                    errors[id].append(f"Tournament {template['name']} was created earlier")
                    continue
                if template.get('type') == 'arena':
                    template['startDate'] = int(tournamentStart.timestamp())*1000
                elif template.get('type') == 'swiss':
                    if tournamentStart <= datetime.utcnow().astimezone(tournamentStart.tzinfo):
                        if not errors.get(id):
                            errors[id] = []
                        errors[id].append(f"Cannot create tournament {template['name']} as it would start in the past")
                        continue
                    template['startsAt'] = int(tournamentStart.timestamp())*1000
                else:
                    if not errors.get(id):
                        errors[id] = []
                    errors[id].append(f"Unsupported template type {template['type']} for {template['name']}")
                    continue
            except KeyError:
                logging.exception("Incomplete template")
                if not errors.get(id):
                    errors[id] = []
                errors[id].append(f"Cannot create tournament {template['name']}. Incomplete template.")
            processed_templates.append(template)
        req = [
            self.lichess.create_tournament(self.token, template['type'], template)
            for template in processed_templates]
        result = await gather(*req, return_exceptions=True)
        created = []
        reply: Dict[str, Any] = {}
        for id, error in errors.items():
            reply[id] = {'success': False, 'error': ', '.join(error)}
        for t, r in zip(processed_templates, result):
            if isinstance(r, dict):
                c = dict(r)
                c.update({
                    'user': self.current_user['id'],
                    'tournament_set': 'default',
                    'template': t.get('id'),
                    'password': t.get('password'),
                    'created': datetime.utcnow().timestamp(),
                    'startTimestamp': t.get('startTimestamp')
                })
                created.append(c)
                reply[t.get('id', '')] = dict(r)
                reply[t.get('id', '')]['success'] = True
                reply[t.get('id', '')]['password'] = t.get('password')
            elif isinstance(r, LichessError):
                reply[t.get('id', '')] = {'success': False, 'error': r.message}
            else:
                reply[t.get('id', '')] = {'success': False, 'error': "Internal error"}

        table = self.db.table('tournaments')
        table.insert_multiple(created)
        self.write(dumps({'success': True, 'created': reply}))
