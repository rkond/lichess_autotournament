import json
import asyncio
from aiogoogle import Aiogoogle
from aiogoogle.auth.creds import ServiceAccountCreds

from typing import Any, Dict, List, Optional, cast

service_account_key = json.load(open('google_key.json'))

creds = ServiceAccountCreds(scopes=['https://www.googleapis.com/auth/drive'],
                            **service_account_key)


async def create_public(title: str) -> Dict[str, Any]:
    async with Aiogoogle(service_account_creds=creds) as aiogoogle:

        sheets = await aiogoogle.discover('sheets', 'v4')
        spreadsheet = {'properties': {'title': title}}
        spreadsheet = await aiogoogle.as_service_account(
            sheets.spreadsheets.create(json=spreadsheet))

        drive = await aiogoogle.discover('drive', 'v3')

        await aiogoogle.as_service_account(
            drive.permissions.create(fileId=spreadsheet['spreadsheetId'],
                                     json={
                                         'type': 'user',
                                         'role': 'writer',
                                         'emailAddress': 'grostik@gmail.com'
                                     }))
        return spreadsheet


async def get(spreadsheetId: str) -> Optional[Dict[str, Any]]:
    async with Aiogoogle(service_account_creds=creds) as aiogoogle:
        sheets = await aiogoogle.discover('sheets', 'v4')
        res = await aiogoogle.as_service_account(
            sheets.spreadsheets.get(spreadsheetId=spreadsheetId),
            raise_for_status=False)
        return cast(Optional[Dict[str, Any]], res)


async def list_spreadsheets() -> List[Any]:
    async with Aiogoogle(service_account_creds=creds) as aiogoogle:
        drive = await aiogoogle.discover('drive', 'v3')

        res = await aiogoogle.as_service_account(drive.files.list())
        files = cast(List[Dict[str, Any]], res['files'])
        sheets = tuple(
            filter(
                lambda file: file['mimeType'] ==
                'application/vnd.google-apps.spreadsheet', files))
        return cast(List[Any], sheets)


async def create_sheet(spreadsheetId: str, title: str) -> int:
    async with Aiogoogle(service_account_creds=creds) as aiogoogle:
        sheets = await aiogoogle.discover('sheets', 'v4')
        res = await aiogoogle.as_service_account(
            sheets.spreadsheets.batchUpdate(spreadsheetId=spreadsheetId,
                                            json={
                                                'requests': [{
                                                    'addSheet': {
                                                        'properties': {
                                                            'title': title
                                                        }
                                                    }
                                                }]
                                            }))
        return cast(int, res['replies'][0]['addSheet']['properties']['sheetId'])


async def write_values(spreadsheetId: str, range: str,
                       data: List[List[str]]) -> None:
    async with Aiogoogle(service_account_creds=creds) as aiogoogle:
        sheets = await aiogoogle.discover('sheets', 'v4')
        await aiogoogle.as_service_account(
            sheets.spreadsheets.values.update(spreadsheetId=spreadsheetId,
                                              range=range,
                                              valueInputOption='USER_ENTERED',
                                              json={
                                                  'range': range,
                                                  'majorDimension': 'ROWS',
                                                  'values': data
                                              }))
        return


async def delete(spreadsheetId: str) -> None:
    async with Aiogoogle(service_account_creds=creds) as aiogoogle:
        service = await aiogoogle.discover('drive', 'v3')
        await aiogoogle.as_service_account(
            service.files.delete(fileId=spreadsheetId))


async def main() -> None:
    # await delete('1nR4Agnv09kYRmtsrhGLIEq4PNZ6Xn-tvneg-i400-Cc')
    # await create_public("test 1")
    files = await list_spreadsheets()
    for file in files:
        await delete(file['id'])


if __name__ == '__main__':
    # Pass: title
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
