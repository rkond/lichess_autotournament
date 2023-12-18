import logging

from typing import cast, Any, Dict, Optional
from datetime import datetime
from json import dumps, loads

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornado.auth
import tornado.escape
import tornado.options

from tinydb import TinyDB, Query

from lichessapi import LichessAPI

from googleapi import create_public, get


class BaseHandler(tornado.web.RequestHandler):  # type: ignore[misc]
    options = tornado.options.options
    token: str
    db: TinyDB

    @classmethod
    def set_db(cls, db: TinyDB) -> None:
        cls.db = db

    @property
    def lichess(self) -> LichessAPI:
        return cast(LichessAPI, self.settings['lichess'])

    async def prepare(self) -> None:
        self.token = (self.get_secure_cookie('t') or b'').decode()
        user = (self.get_secure_cookie('u') or b'').decode()
        if self.token:
            try:
                if user:
                    self._current_user = loads(user)
                    return
                lichess_user = await self.lichess.get_current_user(self.token)
                users = self.db.table('users')
                T = Query()
                current_user = users.get(T.id == lichess_user['id'])
                if current_user is None:
                    current_user = lichess_user
                    users.insert(current_user)
                else:
                    users.update(lichess_user, doc_ids=[current_user.doc_id])
                self._current_user = users.get(T.id == current_user['id'])
                logging.debug(f'User {self._current_user}')
                self.set_secure_cookie('u', dumps(self._current_user), 1)
            except Exception as e:
                logging.warning(f"Cannot get current user: {e}")
                self.clear_cookie('t')

    def get_login_url(self) -> str:
        return "/login"


class BaseAPIHandler(BaseHandler):
    async def prepare(self) -> None:
        await super().prepare()
        self.set_header("Content-Type", "application/json")

    def write_error(self, status_code: int, **kwargs: Any) -> None:
        message = "Internal error"
        if 'exc_info' in kwargs:
            try:
                if isinstance(kwargs['exc_info'][1], tornado.web.HTTPError):
                    message = kwargs['exc_info'][1].log_message
            except Exception:
                logging.exception('Cannot extract exc_info form error')
        self.write(
            dumps({
                'success': False,
                'code': status_code,
                'message': message
            }))

    async def get_stat_spreadsheet_for_user(self,
                                            create_if_absent: bool = False
                                            ) -> Optional[Dict[str, Any]]:
        T = Query()
        spreadsheet = await get(
            self.current_user['stats_spreadsheet']
        ) if 'stats_spreadsheet' in self.current_user else None
        if spreadsheet is None and create_if_absent:
            spreadsheet = await create_public(
                f"Lichess autotournament statistics for {self.current_user['id']}",
                self.current_user['email']
            )
            spreadsheetId = spreadsheet['spreadsheetId']

            users = self.db.table('users')
            users.update({'stats_spreadsheet': spreadsheetId},
                         T.id == self.current_user['id'])
            self._current_user.update({'stats_spreadsheet': spreadsheetId})
            self.set_secure_cookie('u', dumps(self._current_user), 1)
            logging.info(
                f"Spreadsheet {spreadsheetId} for {self.current_user['id']} created"
            )
        if spreadsheet is not None:
            spreadsheet['lastUpdated'] = self.current_user.get('stats_last_updated')
        return spreadsheet

    async def on_stats_updated(self) -> str:
        T = Query()
        users = self.db.table('users')
        now = datetime.utcnow().isoformat()
        users.update({'stats_last_updated': now},
                     T.id == self.current_user['id'])
        self._current_user.update({'stats_last_updated': now})
        self.set_secure_cookie('u', dumps(self._current_user), 1)
        return now
