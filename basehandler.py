import logging

from typing import cast, Any
from json import dumps

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornado.auth
import tornado.escape
import tornado.options

from tinydb import TinyDB

from lichessapi import LichessAPI


class BaseHandler(tornado.web.RequestHandler):
    options = tornado.options.options  # type: ignore[assignment]
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
        if self.token:
            try:
                self._current_user = await self.lichess.get_current_user(self.token)
            except Exception as e:
                logging.warning(f"Cannot get current user: {e}")
                self.clear_cookie('t')

    def get_login_url(self) -> str:
        return "/login"

class BaseAPIHandler(BaseHandler):
    def prepare(self) -> None:
        self.set_header("Content-Type", "application/json")
        return super().prepare()

    def write_error(self, status_code: int, **kwargs: Any) -> None:
        message = "Internal error"
        if 'exc_info' in kwargs:
            try:
                if isinstance(kwargs['exc_info'][1], tornado.web.HTTPError):
                    message = kwargs['exc_info'][1].log_message
            except Exception:
                logging.exception('Cannot extract exc_info form error')
        self.write(dumps({'success': False, 'code': status_code, 'message': message}))
