import logging
from json import loads, dumps

from tinydb import Query

from tornado.options import options
from tornado.web import HTTPError

from basehandler import BaseAPIHandler


class DiplomaTemplateHandler(BaseAPIHandler):
    def get(self, id: str):
        T = Query()
        table = self.db.table('diploma_templates')
        template = table.get((T.user == self.current_user['id']) & (T.id == id))
        logging.info(f"{template}")
        if not template:
            raise HTTPError(404, f"No template with id \"{id}\" for user: \"{self.current_user['id']}\"")
        del template['user']
        del template['id']
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
        table = self.db.table('diploma_templates')
        T = Query()
        table.upsert(value, (T.user == self.current_user['id']) & (T.id == id))
        self.write(dumps({'success': True}))
