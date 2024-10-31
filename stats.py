from datetime import datetime
import calendar
import logging
from json import dumps
from typing import Any, Dict, List, cast
from lichessapi import LichessError

from tinydb import Query
import tornado

from basehandler import BaseAPIHandler
from googleapi import create_sheet, write_values


def get_tournament_url(tournament: Dict[str, Any]) -> str:
    return f'https://lichess.org/{"tournament" if tournament.get("system", "swiss") == "arena" else "swiss"}/{tournament["id"]}'


class TournamentStatsHandler(BaseAPIHandler):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self) -> None:
        T = Query()
        spreadsheet = await self.get_stat_spreadsheet_for_user(
            create_if_absent=True)
        assert spreadsheet is not None
        spreadsheetId = spreadsheet['spreadsheetId']
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
            (T.user == self.current_user['id'])
            & (T.tournament_set == 'default')
            & (T.startTimestamp >= int(startOfLastMonth.timestamp())))
        statsByMonth: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for tournament in tournaments:
            tournament_type = tournament.get('system', 'swiss')
            if 'standings' not in tournament or not tournament['standings'].get('players',[]):
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
                name = standing.get('name') or standing['username']
                if name not in statsByMonth[sheetName]:
                    statsByMonth[sheetName][name] = {
                        'points': 0,
                        'wins': 0,
                        'podiums': 0,
                        'qualifiedWins': 0,
                        'wonTournaments': []
                    }
                statsByMonth[sheetName][
                    name]['points'] += standing.get('score', standing.get('points'))
                if standing['rank'] == 1:
                    statsByMonth[sheetName][name]['wins'] += 1
                    cast(
                        List[str], statsByMonth[sheetName][name]
                        ['wonTournaments']).append(tournament)
                    if len(tournament['standings']['players']) >= 10:
                        statsByMonth[sheetName][
                            name]['qualifiedWins'] += 1
                if standing['rank'] <= 3:
                    statsByMonth[sheetName][name]['podiums'] += 1
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
                f'=HYPERLINK("{get_tournament_url(tournament)}", "{tournament.get("fullName", tournament.get("name", tournament.get("id")))}")'
                for tournament in stats['wonTournaments']
            ] for (playerId, stats) in statsByMonth[sheetName].items())
            rowsCount = len(rows) + 1
            colsCount = max(len(row) for row in rows)
            await write_values(
                spreadsheetId,
                f'{sheetName}!A1:{chr(ord("A") + colsCount - 1)}{rowsCount}',
                rows)
        spreadsheet['lastUpdated'] = (await
                                      self.on_stats_updated())
        self.write(dumps({'spreadsheet': spreadsheet}))
