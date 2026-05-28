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


class TournamentStatsHandlerBase(BaseAPIHandler):
    async def enrich_tournaments_with_standings(self, tournaments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        T = Query()
        force_refresh = self.get_argument('refresh', '')
        table = self.db.table('tournaments')
        for tournament in tournaments:
            tournament_type = tournament.get('system', 'swiss')
            # Sometimes lichess returns a single player instead of full standings
            # refreshing always if we have <3 players in the saved standings
            if force_refresh or 'standings' not in tournament or len(tournament['standings'].get('players', [])) < 3:
                if tournament_type == 'arena':
                    try:
                        lichess_tournament = await self.lichess.get_tournament(
                            self.token, tournament_type, tournament['id'])
                        if lichess_tournament is None:
                            logging.warning(
                                f"Tournament was deleted {tournament['id']}")
                            standings = {'players': []}
                        else:
                            standings = lichess_tournament['standing']
                    except LichessError:
                        logging.warning(
                            f"Tournament was deleted {tournament['id']}")
                        standings = {'players': []}
                elif tournament_type == 'swiss':
                    try:
                        standings = {
                            'players':
                            (await self.lichess.get_swiss_standings(
                                self.token, tournament['id'], 10)) or []
                        }
                    except LichessError:
                        logging.warning(
                            f"Tournament was deleted {tournament['id']}")
                        standings = {'players': []}
                if 'doc_id' in tournament:
                    table.update({'standings': standings}, T.id == tournament['id'])
                tournament['standings'] = standings
        return tournaments

    def consolidate_stats_by_month(self, year: int, tournaments: List[Dict[str, Any]]) -> Dict[str, Dict[str, Dict[str, Any]]]:
        statsByMonth: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for tournament in tournaments:
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
        return statsByMonth


class TournamentStatsHandler(TournamentStatsHandlerBase):
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

        tournaments = await self.enrich_tournaments_with_standings(tournaments)

        statsByMonth = self.consolidate_stats_by_month(year, tournaments)
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


class TournamentStatsDebugHandler(TournamentStatsHandlerBase):
    @tornado.web.authenticated  # type: ignore[misc]
    async def get(self) -> None:
        swiss_ids = self.get_argument('swiss', '').split(',')
        arena_ids = self.get_argument('arena', '').split(',')
        tournaments = [({'id': id, 'system': 'arena'}) for id in arena_ids if id] +\
            [({'id': id, 'system': 'swiss'}) for id in swiss_ids if id]
        for tournament in tournaments:
            lichess_tournament = await self.lichess.get_tournament(self.token, tournament['system'], tournament['id'])
            tournament['startTimestamp'] = datetime.fromisoformat(lichess_tournament['startsAt']).timestamp()
        tournaments = await self.enrich_tournaments_with_standings(tournaments)
        stats = self.consolidate_stats_by_month(datetime.utcnow().year, tournaments)
        self.write(dumps({'tournaments': tournaments, 'stats': stats}))
