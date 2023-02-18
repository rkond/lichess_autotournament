import logging

from typing import cast, Any
from json import dumps, loads

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornado.auth
import tornado.escape
import tornado.options

from tinydb import TinyDB

from lichessapi import LichessAPI


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
                self._current_user = await self.lichess.get_current_user(self.token)
                self.set_secure_cookie('u', dumps(self._current_user), 1)
            except Exception as e:
                logging.warning(f"Cannot get current user: {e}")
                self.clear_cookie('t')
                self.clear_cookie('u')

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
        self.write(dumps({'success': False, 'code': status_code, 'message': message}))
