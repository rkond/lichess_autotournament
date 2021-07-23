import logging

from typing import cast

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornado.auth
import tornado.escape

from lichessapi import LichessAPI


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
