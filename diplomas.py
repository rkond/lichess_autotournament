import logging
from json import loads, dumps, load, dump
from os.path import join as path_join
from os import makedirs

from tinydb import Query

from tornado.options import options
from tornado.web import HTTPError

from basehandler import BaseAPIHandler

class DiplomaTemplateHandler(BaseAPIHandler):
    def get(self, id: str):
        T = Query()
        table = self.db.table('diploma_templates')
        template = table.get((T.user == self.current_user['id']) & (T.id == id))
        if not template:
            raise HTTPError(404, f"No template with id \"{id}\" for user: \"{self.current_user['id']}\"")
        del template['user']
        del template['id']
        if fields_file := template.get('fields_file'):
            template['fields'] = load(open(path_join(options.db_dir, 'diplomas', fields_file)))
        template.update({'success': True})
        self.write(dumps(template))

    def post(self, id: str):
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
