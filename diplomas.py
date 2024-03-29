from json import loads, dumps, load, dump
from os.path import join as path_join
from os import makedirs
from copy import deepcopy
from secrets import token_urlsafe
from shutil import copyfile

from tinydb import Query

from tornado.options import options
from tornado.web import HTTPError
import tornado.web

from basehandler import BaseAPIHandler


class DiplomaTemplateHandler(BaseAPIHandler):

    @tornado.web.authenticated  # type: ignore[misc]
    def get(self, id: str) -> None:
        T = Query()
        table = self.db.table('diploma_templates')
        if id:
            template = table.get((T.user == self.current_user['id']) & (T.id == id))
            if not template:
                raise HTTPError(404, f"No template with id \"{id}\" for user: \"{self.current_user['id']}\"")
            del template['user']
            del template['id']
            if fields_file := template.get('fields_file'):
                template['fields'] = load(open(path_join(options.db_dir, 'diplomas', fields_file)))
            template.update({'success': True})
            self.write(dumps(template))
        else:
            templates = table.search((T.user == self.current_user['id']))
            templates.sort(key=lambda template: template.get('index', 0))
            self.write(dumps({'success': True, 'templates': templates}))

    @tornado.web.authenticated  # type: ignore[misc]
    def post(self, id: str) -> None:
        value = {}
        try:
            value = loads(self.request.body.decode())
        except ValueError:
            raise HTTPError(400, "Invalid JSON")
        value['id'] = id
        value['user'] = self.current_user['id']
        if 'fields' in value:
            fields_file = f'{value["user"]}-{value["id"]}'
            makedirs(path_join(options.db_dir, 'diplomas'), mode=0o700, exist_ok=True)
            dump(value['fields'], open(path_join(options.db_dir, 'diplomas', fields_file), 'w'))
            del value['fields']
            value['fields_file'] = fields_file
        table = self.db.table('diploma_templates')
        T = Query()
        table.upsert(value, (T.user == self.current_user['id']) & (T.id == id))
        self.write(dumps({'success': True}))

    @tornado.web.authenticated  # type: ignore[misc]
    def delete(self, id: str) -> None:
        T = Query()
        table = self.db.table('diploma_templates')
        u = table.remove((T.user == self.current_user['id']) & (T.id == id))
        self.write(dumps({'success': bool(u)}))

    @tornado.web.authenticated  # type: ignore[misc]
    def patch(self, id: str) -> None:
        value = {}
        try:
            value = loads(self.request.body.decode())
        except ValueError:
            raise HTTPError(400, "Invalid JSON")
        table = self.db.table('diploma_templates')
        T = Query()
        template = table.get((T.user == self.current_user['id']) & (T.id == id))
        if not template:
            raise HTTPError(404, f"No template with id \"{id}\" for user: \"{self.current_user['id']}\"")
        template['index'] = value.get('index', template.get('index', 0))
        template['name'] = value.get('name', template.get('name', 0))
        table.upsert(template, (T.user == self.current_user['id']) & (T.id == id))
        self.write(dumps({'success': True}))


class DiplomaDuplicateHandler(BaseAPIHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    def post(self, id: str) -> None:
        T = Query()
        table = self.db.table('diploma_templates')
        template = table.get((T.user == self.current_user['id']) & (T.id == id))
        if not template:
            raise HTTPError(404, f"No template with id \"{id}\" for user: \"{self.current_user['id']}\"")
        value = deepcopy(dict(template))
        value['id'] = token_urlsafe(16)
        value['user'] = self.current_user['id']
        fields_file = f'{value["user"]}-{value["id"]}'
        makedirs(path_join(options.db_dir, 'diplomas'), mode=0o700, exist_ok=True)
        copyfile(
            path_join(options.db_dir, 'diplomas', value['fields_file']),
            path_join(options.db_dir, 'diplomas', fields_file))
        value['fields_file'] = fields_file
        table.upsert(value, (T.user == self.current_user['id']) & (T.id == value['id']))
        self.write(dumps({'success': True, 'value': value}))
