from asyncio import gather
from urllib.parse import urlencode
from secrets import token_urlsafe
from hashlib import sha256
from base64 import urlsafe_b64encode
from json import dumps, loads

from typing import cast, Any, Dict, List, Optional, Tuple

from tornado.httpclient import AsyncHTTPClient


class LichessAPI():
    _OAUTH_AUTHORIZE_URL = 'https://lichess.org/oauth'
    _OAUTH_ACCESS_TOKEN_URL = 'https://lichess.org/api/token'
    _ACCOUNT_URL = 'https://lichess.org/api/account'
    _EMAIL_URL = 'https://lichess.org/api/account/email'

    def __init__(self, client_id: str, redirect_uri: str):
        self.client_id = client_id
        self.redirect_uri = redirect_uri
        self.http = AsyncHTTPClient(force_instance=True)

    def __del__(self) -> None:
        self.http.close()

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
        res = await self.http.fetch(
            self._OAUTH_ACCESS_TOKEN_URL,
            method='POST',
            headers={
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body=urlencode({
                'grant_type': 'authorization_code',
                'code': code,
                'code_verifier': code_verifier,
                'redirect_uri': self.redirect_uri,
                'client_id': self.client_id
            }),
            raise_error=False)
        if res.code == 200:
            return cast(str, loads(res.body.decode())['access_token'])
        elif res.code == 400:
            raise RuntimeError(f"Bad Lichess Request: {res.body.decode() if res.body else ''}")
        else:
            raise RuntimeError(f"Error in Lichess Request: {res.code} {res.body.decode() if res.body else ''}")

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
