from json import loads, dumps
from secrets import token_urlsafe
from typing import Any, Dict

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
            self.write(dumps({'tournament': self.filter_allowed_fields(template), 'success': True}))
        else:
            templates = table.search((T.user == self.current_user['id'])
                                     & (T.tournament_set == 'default'))
            res = [self.filter_allowed_fields(t) for t in templates]

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
