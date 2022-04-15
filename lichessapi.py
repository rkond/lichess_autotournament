import logging

from asyncio import gather
from urllib.parse import urlencode
from secrets import token_urlsafe
from hashlib import sha256
from base64 import urlsafe_b64encode
from json import loads

from typing import cast, Any, Dict, List, Optional, Tuple, Union

from tornado.httpclient import AsyncHTTPClient


class LichessError(RuntimeError):
    def __init__(self, code: int, message: str, *args: object) -> None:
        super().__init__(*args)
        self.code = code
        self.message = message


class LichessAPI():
    _OAUTH_AUTHORIZE_URL = 'https://lichess.org/oauth'
    _OAUTH_ACCESS_TOKEN_URL = 'https://lichess.org/api/token'
    _USER_URL = 'https://lichess.org/api/user'
    _ACCOUNT_URL = 'https://lichess.org/api/account'
    _EMAIL_URL = 'https://lichess.org/api/account/email'
    _USER_TEAMS_URL = 'https://lichess.org/api/team/of'

    ARENA_URL = 'https://lichess.org/api/tournament'
    TEAM_URL = 'https://lichess.org/api/team'

    def __init__(self, client_id: str, redirect_uri: str):
        self.client_id = client_id
        self.redirect_uri = redirect_uri
        self.http = AsyncHTTPClient(force_instance=True)

    def __del__(self) -> None:
        self.http.close()

    async def _make_request(
            self,
            url: str,
            token: str,
            method: str,
            **kwargs: Any) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
        headers: Dict[str, str] = {}
        body = None
        if kwargs:
            if method == 'GET':
                url = f'{url}?{urlencode(kwargs)}'
            else:
                body = urlencode(kwargs).encode()
                headers.update({'Content-Type': 'application/x-www-form-urlencoded'})
        if token:
            headers.update({'Authorization': f' Bearer {token}'})
        res = await self.http.fetch(
            url,
            method=method,
            headers=headers,
            body=body,
            raise_error=False)
        if res.code == 200:
            if b'\n' in res.body:
                return cast(List[Dict[str, Any]], [loads(line) for line in res.body.decode().splitlines()])
            return cast(Dict[str, Any], loads(res.body.decode()))
        message = f"Bad Lichess Request: {res.body.decode() if res.body else ''}"
        try:
            json = loads(res.body.decode())
            message = str(json.get('error_description') or json.get('error'))
        except ValueError:
            logging.exception("Error decoding lichess response")
        logging.error(f"Lichess API error: {res.code}, {res.body.decode()}")
        raise LichessError(res.code, message)

    def get_authorize_url(self,  scope: List[str], state: Optional[str] = None) -> Tuple[str, str]:
        code_verifier = token_urlsafe(64)
        # Have to trim the trailing =
        code_challenge = urlsafe_b64encode(sha256(code_verifier.encode('ascii')).digest()).decode().strip('=')
        args = {
            'response_type': 'code',
            'redirect_uri': self.redirect_uri,
            'client_id': self.client_id,
            'scope': " ".join(scope),
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256'
        }
        if state is not None:
            args['state'] = state
        return f'{self._OAUTH_AUTHORIZE_URL}/?{urlencode(args)}', code_verifier

    async def get_access_token(self, code: str, code_verifier: str) -> str:
        return cast(str, cast(Dict[str, Any], (await self._make_request(
            self._OAUTH_ACCESS_TOKEN_URL,
            method='POST',
            token='',
            grant_type='authorization_code',
            code=code,
            code_verifier=code_verifier,
            redirect_uri=self.redirect_uri,
            client_id=self.client_id
        )))['access_token'])

    async def get_user(self, token: str, username: str) -> Dict[str, Any]:
        return cast(Dict[str, Any], await self._make_request(
                    f'{self._USER_URL}/{username}',
                    method='GET',
                    token=token))

    async def get_current_user(self, token: str) -> Dict[str, Any]:
        account_request = self.http.fetch(
            self._ACCOUNT_URL,
            method='GET',
            headers={
                'Authorization': f' Bearer {token}'
            })
        email_request = self.http.fetch(
            self._EMAIL_URL,
            method='GET',
            headers={
                'Authorization': f' Bearer {token}'
            })
        user, email = [loads(res.body.decode()) for res in await gather(account_request, email_request)]
        user.update(email)
        return cast(Dict[str, Any], user)

    async def get_user_teams(self, token: str, username: str) -> List[Dict[str, Any]]:
        return cast(List[Dict[str, Any]], await self._make_request(
            f'{self._USER_TEAMS_URL}/{username}',
            method='GET',
            token=token))

    async def get_tournament(self, token: str, type: str, id: str, team_id: str = '') -> Dict[str, Any]:
        if type == 'arena':
            return cast(Dict[str, Any], await self._make_request(
                f'{self.ARENA_URL}/{id}',
                method='GET',
                token=token))
        elif type == 'swiss':
            tournaments: List[Dict[str, Any]] = cast(List[Dict[str, Any]], await self._make_request(
                f'{self.TEAM_URL}/{team_id}/swiss',
                method='GET',
                token=token,
                max=100000))
            for t in tournaments:
                if t['id'] == id:
                    return t
            raise RuntimeError("Tournament not found")
        else:
            raise ValueError(f"Unknown tournament type {type}")

    async def create_tournament(self, token: str, type: str, template_dict: Dict[str, Any]) -> Dict[str, Any]:
        if type == 'arena':
            for k, v in template_dict.items():
                if isinstance(v, bool):
                    template_dict[k] = str(v).lower()
            template_dict['clockTime'] = f'{int(template_dict["clockTime"])/60:.1f}'
            return cast(Dict[str, Any], await self._make_request(
                f'{self.ARENA_URL}',
                method='POST',
                token=token,
                **template_dict))
        elif type == 'swiss':
            raise NotImplementedError("No swiss tournaments yet")
        else:
            raise ValueError(f"Unknown tournament type {type}")
