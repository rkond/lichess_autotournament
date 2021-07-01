import logging
import os
import pwd
import grp
from json import dumps, loads

from typing import cast, Any, ClassVar, Dict, List, Optional, Tuple, Sequence

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornado.auth
from tornado.options import define, options, parse_config_file, parse_command_line
import tornado.escape

from version import __version__, __revision__

base_path = os.path.abspath(os.path.dirname(__file__))
os.chdir(base_path)


class HomeHandler(tornado.web.RequestHandler):
    def get(self) -> None:
        self.render("home.html")


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

    define('cookie_secret', type=str)


define_options()
parse_command_line()
parse_config_file(options.config)

settings = {
    'template_path': options.template_path,
    'debug': options.debug,
    'autoescape': tornado.escape.xhtml_escape,
    'options': options,
    'xheaders': True,
    'static_path': options.static_path,
    'cookie_secret': options.cookie_secret,
    'xsrf_cookies': True,
}

urls = [
    (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": options.static_path}),
    (r"/", HomeHandler),
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
