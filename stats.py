from datetime import datetime
import calendar
import logging
from json import dumps
from typing import Any, Dict, List, cast
from lichessapi import LichessError

from tinydb import Query
import tornado

from basehandler import BaseAPIHandler
from googleapi import create_public, create_sheet, get, write_values


def get_tournament_url(tournament: Dict[str, Any]) -> str:
    return f'https://lichess.org/{"tournament" if tournament["system"] == "arena" else  "swiss"}/{tournament["id"]}'


class TournamentStatsHandler(BaseAPIHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self) -> None:
        T = Query()
        if 'stats_spreadsheet' not in self.current_user or not (
                spreadsheet := await get(self.current_user['stats_spreadsheet']
                                         )):
            spreadsheet = await create_public(
                f"Lichess autotournament statistics for {self.current_user['id']}"
            )
            spreadsheetId = spreadsheet['spreadsheetId']
            spreadsheetUrl = spreadsheet['spreadsheetUrl']
            users = self.db.table('users')
            users.update({'stats_spreadsheet': spreadsheetId},
                         T.id == self.current_user['id'])
            self._current_user.update({'stats_spreadsheet': spreadsheetId})
            self.set_secure_cookie('u', dumps(self._current_user), 1)
            logging.info(
                f"Spreadsheet {spreadsheetId} for {self.current_user['id']} created"
            )
        else:
            spreadsheetId = self.current_user['stats_spreadsheet']
        spreadsheetId = spreadsheet['spreadsheetId']
        spreadsheetUrl = spreadsheet['spreadsheetUrl']
        now = datetime.utcnow()
        if now.month == 1:
            year = now.year - 1
            month = 12
        else:
            year = now.year
            month = now.month - 1
        startOfLastMonth = datetime(year=year, month=month, day=1)
        logging.debug(f"Tournaments from {startOfLastMonth}")
        table = self.db.table('tournaments')
        tournaments = table.search(
            (T.user == 'nimven')
            & (T.tournament_set == 'default')
            & (T.startTimestamp >= int(startOfLastMonth.timestamp())))
        statsByMonth: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for tournament in tournaments:
            tournament_type = tournament.get('system', 'swiss')
            if 'standings' not in tournament:
                if tournament_type == 'arena':
                    try:
                        lichess_tournament = await self.lichess.get_tournament(
                            self.token, tournament_type, tournament['id'])
                        standings = lichess_tournament['standing']
                    except LichessError:
                        logging.warning(
                            f"Tournament was deleted {tournament['id']}")
                        standings = {'players': []}
                elif tournament_type == 'swiss':
                    standings = {
                        'players':
                        await self.lichess.get_swiss_standings(
                            self.token, tournament['id'], 10)
                    }
                table.update({'standings': standings}, None,
                             [tournament.doc_id])
                tournament['standings'] = standings

            tournamentStart = datetime.fromtimestamp(
                tournament['startTimestamp'])
            sheetName = f"{year} {calendar.month_abbr[tournamentStart.month]}"

            if sheetName not in statsByMonth:
                statsByMonth[sheetName] = {}
            for standing in tournament['standings']['players']:
                if standing['name'] not in statsByMonth[sheetName]:
                    statsByMonth[sheetName][standing['name']] = {
                        'points': 0,
                        'wins': 0,
                        'podiums': 0,
                        'qualifiedWins': 0,
                        'wonTournaments': []
                    }
                statsByMonth[sheetName][
                    standing['name']]['points'] += standing['score']
                if standing['rank'] == 1:
                    statsByMonth[sheetName][standing['name']]['wins'] += 1
                    cast(
                        List[str], statsByMonth[sheetName][standing['name']]
                        ['wonTournaments']).append(tournament)
                    if len(tournament['standings']) >= 10:
                        statsByMonth[sheetName][
                            standing['name']]['qualifiedWins'] += 1
                if standing['rank'] <= 3:
                    statsByMonth[sheetName][standing['name']]['podiums'] += 1
        sheets = spreadsheet['sheets']
        for sheetName in statsByMonth:
            if not any(sheet['properties']['title'] == sheetName
                       for sheet in sheets):
                await create_sheet(spreadsheetId, sheetName)
            titleRow = [
                'Player id', 'Points', 'Wins', 'Wins with >= 10 players',
                'Podiums', 'Won tournaments'
            ]
            rows: List[List[Any]] = [titleRow] + list([
                playerId,
                stats['points'],
                stats['wins'],
                stats['qualifiedWins'],
                stats['podiums'],
            ] + [
                f'=HYPERLINK("{get_tournament_url(tournament)}", "{tournament["fullName"]}")'
                for tournament in stats['wonTournaments']
            ] for (playerId, stats) in statsByMonth[sheetName].items())
            rowsCount = len(rows) + 1
            colsCount = max(len(row) for row in rows)
            await write_values(
                spreadsheetId,
                f'{sheetName}!A1:{chr(ord("A") + colsCount - 1)}{rowsCount}',
                rows)

        self.write(dumps({'spreadsheet': spreadsheetUrl}))
