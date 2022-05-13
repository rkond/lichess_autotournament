 # Automated tournaments for lichess
 This is a software to automate tournament creation for lichess.org. It's intended for chess schools that regularly use lichess for tournaments. Creating many tournaments each week can be tediuos. This software allows one to create a templates and use them to create tournaments weekly with just one click.

 ## Features
 - Copy parameters from existing tournament for new template
 - Create tournaments up to 6 weeks in advance
 - Automated generation of diplomas/certificate for top 10 players from customizable templates

 ## Limitations
 - Lichess limits number of tournaments one user can create in a day to 12 public or 24 private tournaments
 - Not all attributes are copied to a template from an existing tournaments as lichess API doesn't provide full information

 Contributions are welcome

 ## Running
  ```shell
mkdir -p /etc/lichess
cp prod.conf.example /etc/lichess/tournaments.conf
vi /etc/lichess/tournaments.conf # Edit values for your system
python3 -m venv .venv
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 webapp.py
 ```