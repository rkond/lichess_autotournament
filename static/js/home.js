'use strict';

const e = React.createElement;

const weekdays = [3, 4, 5, 6, 7, 8, 9].map(day => (new Date(`2022-01-0${day}`)).toLocaleDateString(undefined, { weekday: 'long' }));

const userTeams = null;

function TournamentTemplates(props) {
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState({ request: false, loading: true });
  const [teams, setTeams] = React.useState(null);
  const [expandedIndex, setExpanded] = React.useState(null);

  React.useLayoutEffect(() => {
    if (teams == null) {
      setTeams('loading');
      fetch(`/api/v1/teams`, {
        credentials: 'include',
      }).then(res => res.json())
        .then(res => {
          if (res.success && res.teams) {
            setTeams(res.teams);
          } else {
            setTeams('error');
          }
        })
        .catch(() => {
          setTeams('error');
        });
    }

    if (loading.request)
      return
    setLoading({ request: true, loading: true });
    fetch(`/api/v1/tournament/template/`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .catch(() => null)
      .then(res => {
        if (res.templates && res.success) {
          setTemplates(res.templates);
        }
        setLoading({ request: true, loading: false });
      });
  });

  const onEdit = (index, template) => {
    fetch(`/api/v1/tournament/template/${templates[index].id}?_xsrf=${xsrf}`, {
      credentials: 'include',
      method: 'PATCH',
      headers: {
        'Content-Type': 'appication/json'
      },
      body: JSON.stringify(template)
    })
      .then(res => res.json())
      .then(res => {
        if (!res.success) {
          console.error(res);
          return;
        }
        setExpanded(null);
        setLoading({ request: false, loading: true });
      });
  }

  const onDelete = (index) => {
    if (!window.confirm(`Do you want to delete template: ${templates[index].name}`))
      return;
    fetch(`/api/v1/tournament/template/${templates[index].id}?_xsrf=${xsrf}`, {
      credentials: 'include',
      method: 'DELETE',
      headers: {
        'Content-Type': 'appication/json'
      }
    })
      .then(res => res.json())
      .then(res => {
        if (!res.success) {
          console.error(res);
          return;
        }
        setLoading({ request: false, loading: true });
      });
  }

  const onSave = (template) => {
    fetch(`/api/v1/tournament/template/?_xsrf=${xsrf}`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'appication/json'
      },
      body: JSON.stringify(template)
    })
      .then(res => res.json())
      .then(res => {
        if (!res.success) {
          console.error(res);
          return;
        }
        setExpanded(res.id);
        setLoading({ request: false, loading: true });
      });
  }

  const onSelectedTemplate = (index) => {
    const newTemplates = Array.from(templates);
    newTemplates[index].selected = !templates[index].selected;
    setTemplates(newTemplates);
  }

  const [created, setCreated] = React.useState([])
  const [errors, setErrors] = React.useState([])
  const onCreated = (createdTournaments) => {
    const newCreated = Array.from(created);
    const newErrors = [];
    Object.entries(createdTournaments.created).forEach(([templateId, result]) => {
      const template = templates.find(t => t.id ==templateId);
      if (result.success) {
        newCreated.push({
          template: template,
          tournament: result
        })
      } else {
        newErrors.push({
          template: template,
          error: result.error
        })
      }
    });
    setCreated(newCreated);
    setErrors(newErrors);
  }

  const [selected, setSelected] = React.useState(new Set());
  const onSelectedTournament = (index) => {
    const s = new Set(selected);
    if (!s.has(index))
      s.add(index);
    else
      s.delete(index);
    setSelected(s);
  }



  return loading.loading ? e(Loader, {}) :
    e('div', { id: 'current_templates', key: 'current_templates' },
      e('h1', {}, "Tournament templates"),
      templates.length ? e('ol', { className: 'template_list' },
        templates.map((template, index) => e(TemplateBox, {
          key: template['id'],
          index: index,
          template: template,
          expanded: index == expandedIndex,
          teams: teams,
          onSelected: () => onSelectedTemplate(index),
          onEdit: (template) => onEdit(index, template),
          onDelete: () => onDelete(index),
          onClick: () => setExpanded(index),
          onCancel: () => setExpanded(null)
        })),
        e(TemplateBox, {
          empty: true,
          index: "new",
          expanded: "new" == expandedIndex,
          teams: teams,
          onEdit: onSave,
          onClick: () => setExpanded("new"),
          onCancel: () => setExpanded(null)
        })
      ) : e('p', {}, "No tournament templates"),
      e(TournamentCreation, {
        templates: templates,
        onCreated: onCreated
      }),
      e(CreatedTournaments, {
        newTournaments: created,
        errors: errors,
        selected: selected,
        onSelected: onSelectedTournament
      }),
    )
}

function TemplateBox(props) {
  return e('li', {
    className: `tournament_short ${props.expanded ? 'expanded' : ''}`,
    onClick: props.expanded ? null : props.onClick
  },
    props.empty ? null : e('a', { href: '#', className: 'close', onClick: (event) => { event.preventDefault(); props.onDelete(props.index) } }),
    props.empty ? null : e('input', {
      type: 'checkbox',
      className: 'tournament_select',
      defaultChecked: Boolean(props.template.selected),
      onClick: (event) => { event.stopPropagation(); props.onSelected() }
    }),
    e('span', {
      className: "tournament_name"
    }, props.empty ? "Create new template" : props.template.name),
    props.empty ? null : e('span', {
      className: "tournament_date"
    }, new Date(props.template.startDate * 1000).toLocaleTimeString(undefined, { weekday: 'long', hour: 'numeric', minute: 'numeric' })),
    props.expanded ? e(TemplateEditor, {
      teams: props.teams,
      fields: props.empty ? {} : props.template,
      onDelete: props.onDelete,
      onSave: props.onEdit,
      onCancel: props.onCancel
    }) : null
  )
}

function TemplateEditor(props) {
  const [fields, setFields] = React.useState(Object.assign({
    type: 'arena',
    name: 'Untitled',
    clockTime: 30,
    clockIncrement: 30,
    minutes: 60,
    startDate: (new Date()).getTime() / 1000,
    variant: 'standard',
    rated: true,
    berserkable: true,
    streakable: true,
    hasChat: true,
    description: '',
    password: '',
    'conditions.teamMember.teamId': '',
    'conditions.minRating.rating': 0,
    'conditions.maxRating.rating': 0,
    'conditions.nbRatedGame.nb': 0
  }, props.fields));

  const changeField = (key, value) => {
    setFields(Object.assign({
    }, fields, Object.fromEntries([[key, value]])))
  }

  const [prototypeURL, setPrototypeURL] = React.useState('');

  const copyFromLichess = () => {
    fetch(`/api/v1/tournament?${new URLSearchParams({ tournament: prototypeURL })}`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          delete res.success;
          res.startDate = (new Date(res.startsAt)).getTime() / 1000;
          res.name = res.fullName.endsWith(" Arena")?res.fullName.slice(0,-6): res.fullName;
          res.clockTime = parseInt(res.clock.limit) / 60;
          res.clockIncrement = res.clock.increment;
          res.streakable = !res.noStreak;
          res.verdicts.list.forEach(v => {
            if (v.condition.startsWith("Must be in team"))
              res['conditions.teamMember.teamId'] = props.teams.reduce((a, c) => (a == '' && v.condition.endsWith(c.name)) ? c.id : '', '')
            const nbRated = v.condition.match(/≥ (\d+) rated games/)
            if (nbRated && nbRated[1])
              res['conditions.nbRatedGame.nb'] = parseInt(nbRated[1]);
            const minRating = v.condition.match(/Rated ≥ (\d+) in/)
            if (minRating && minRating[1])
              res['conditions.minRating.rating'] = parseInt(minRating[1]);
            const maxRating = v.condition.match(/Rated ≤ (\d+) in/)
            if (maxRating && maxRating[1])
              res['conditions.maxRating.rating'] = parseInt(maxRating[1]);
          });
          for (let v in res.verdicts.list) {
            if (res.verdicts.list[v].condition.startsWith("Must be in team")) {
              for (let t in props.teams) {
                if (res.verdicts.list[v].condition.endsWith(props.teams[t].name)) {
                  res['conditions.teamMember.teamId'] = props.teams[t].id;
                  break;
                }
              }
            }
            if (res.verdicts.list[v].condition.startsWith("Must be in team")) {
              for (let t in props.teams) {
                if (res.verdicts.list[v].condition.endsWith(props.teams[t].name)) {
                  res['conditions.teamMember.teamId'] = props.teams[t].id;
                  break;
                }
              }
            }
          }
          const newFields = Object.assign({}, fields);
          for (const f in fields) {
            if (res[f] != undefined)
              newFields[f] = res[f];
          }
          setFields(newFields);
        } else {
          alert("Invalid tournament URL")
        }
      });
  }

  return e('div', {
    className: 'template_edit'
  },
    e('a', { href: '#', className: "close", onClick: (event) => { event.preventDefault(); props.onDelete(props.index) } }),
    e(TournamentURLField, {
      name: 'template_url',
      label: "Copy from lichess",
      button: "Copy",
      changeField: (key, value) => setPrototypeURL(value),
      onButtonClick: copyFromLichess,
    }),
    e(TournamentSelectField, {
      name: 'type',
      label: "Tournament type",
      options: [
        { value: 'arena', text: "Arena" }
      ],
      value: fields.type,
      changeField: changeField
    }),
    e(TournamentTextField, {
      name: 'name',
      label: "Tournament name",
      maxLength: 30,
      value: fields.name,
      changeField: changeField
    }),
    e(TournamentSelectField, {
      name: 'clockTime',
      label: "Clock time",
      options: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 10, 15, 20, 25, 30, 40, 50, 60].map((time) => ({ value: time, text: `${time} min` })),
      value: fields.clockTime,
      changeField: changeField
    }),
    e(TournamentNumberField, {
      name: 'clockIncrement',
      label: "Clock increment",
      min: 0, max: 60, unit: "sec",
      value: fields.clockIncrement,
      changeField: changeField
    }),
    e(TournamentNumberField, {
      name: 'minutes',
      label: "Tournament length",
      min: 0, max: 360, unit: "min",
      value: fields.minutes,
      changeField: changeField
    }),
    e(TournamentDatetimeField, {
      name: 'startDate',
      label: "Starts at",
      value: fields.startDate,
      changeField: changeField
    }),
    e(TournamentSelectField, {
      name: 'variant',
      label: "Variant",
      options: [
        { value: 'standard', text: "Standard" },
        { value: 'chess960', text: "Chess 960" },
        { value: 'crazyhouse', text: "Crazyhouse" },
        { value: 'antichess', text: "Antichess" },
        { value: 'atomic', text: "Atomic" },
        { value: 'horde', text: "Horde" },
        { value: 'kingOfTheHill', text: "King of the Hill" },
        { value: 'racingKings', text: "Racing Kings" },
        { value: 'threeCheck', text: "Three Check" },
      ],
      value: fields.variant,
      changeField: changeField
    }),
    e(TournamentCheckboxField, {
      name: 'rated',
      label: "Rated",
      value: fields.rated,
      changeField: changeField
    }),
    e(TournamentCheckboxField, {
      name: 'berserkable',
      label: "Berserkable",
      value: fields.berserkable,
      changeField: changeField
    }),
    e(TournamentCheckboxField, {
      name: 'streakable',
      label: "Streakable",
      value: fields.streakable,
      changeField: changeField
    }),
    e(TournamentCheckboxField, {
      name: 'hasChat',
      label: "Has chat",
      value: fields.hasChat,
      changeField: changeField
    }),
    e(TournamentTextareaField, {
      name: 'description',
      label: "Description",
      value: fields.description,
      changeField: changeField
    }),
    e(TournamentTextField, {
      name: 'password',
      label: "Password",
      value: fields.password,
      changeField: changeField
    }),
    e(TournamentSelectField, {
      name: 'conditions.teamMember.teamId',
      label: "Restrict to team members of",
      options:
        props.teams == null || props.teams == 'loading' ?
          [{ value: '', text: `Loading…` }] : (props.teams == 'error' ?
            [{ value: '', text: `Error loading teams` }] :
            [{ value: '', text: `No restriction` }].concat(props.teams.map(team => ({
              value: team.id, text: team.name
            })))
          ),
      value: fields['conditions.teamMember.teamId'],
      changeField: changeField
    }),
    e(TournamentNumberField, {
      name: 'conditions.minRating.rating',
      label: "Minimum rating or 0",
      min: 0, max: 4000, unit: "",
      value: fields['conditions.minRating.rating'],
      changeField: changeField
    }),
    e(TournamentNumberField, {
      name: 'conditions.maxRating.rating',
      label: "Maximum rating or 0",
      min: 0, max: 4000, unit: "",
      value: fields['conditions.maxRating.rating'],
      changeField: changeField
    }),
    e(TournamentNumberField, {
      name: 'conditions.nbRatedGame.nb',
      label: "Minimum number of rated games",
      min: 0, max: 1000, unit: "",
      value: fields['conditions.nbRatedGame.nb'],
      changeField: changeField
    }),
    e('button', {
      onClick: () => props.onSave(fields)
    }, "Save"),
    e('button', {
      onClick: props.onCancel
    }, "Cancel")
  )
}

function TournamentURLField(props) {
  return e('span', { className: 'tournament_form_field' },
    e('label', { htmlFor: props.name }, props.label),
    e('input', {
      type: 'url',
      value: props.value,
      placeholder: "https://lichess.org/tournament/XXXXXXXX",
      onChange: (event) => props.changeField(props.name, event.target.value)
    }), props.button ?
    e('button', {
      onClick: props.onButtonClick
    }, props.button) : null);
}

function TournamentTextField(props) {
  return e('span', { className: 'tournament_form_field' },
    e('label', { htmlFor: props.name }, props.label),
    e('input', {
      type: 'text',
      value: props.value,
      maxLength: props.maxLength,
      onChange: (event) => props.changeField(props.name, event.target.value)
    }));
}

function TournamentTextareaField(props) {
  return e('span', { className: 'tournament_form_field' },
    e('label', { htmlFor: props.name }, props.label),
    e('br'),
    e('textarea', {
      value: props.value,
      rows: 4,
      cols: 40,
      onChange: (event) => props.changeField(props.name, event.target.value)
    }));
}

function TournamentCheckboxField(props) {
  return e('span', { className: 'tournament_form_field' },
    e('label', { htmlFor: props.name }, props.label),
    e('input', {
      type: 'checkbox',
      checked: props.value,
      onChange: (event) => props.changeField(props.name, event.target.checked)
    }));
}

function TournamentNumberField(props) {
  return e('span', { className: 'tournament_form_field' },
    e('label', { htmlFor: props.name }, props.label),
    e('input', {
      type: 'number',
      value: props.value,
      min: props.min,
      max: props.max,
      onChange: (event) => props.changeField(props.name, event.target.value)
    }), props.unit);
}

function TournamentDatetimeField(props) {
  const getWeekday = (timestamp) => weekdays.indexOf((new Date(timestamp * 1000)).toLocaleDateString(undefined, { weekday: 'long' }))
  const getTime = (timestamp) => (new Date(timestamp * 1000)).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' })
  const [weekday, setWeekday] = React.useState(getWeekday(props.value));
  const [time, setTime] = React.useState(getTime(props.value));
  React.useEffect(() => {
    setWeekday(getWeekday(props.value));
    setTime(getTime(props.value));
  }, [props.value])
  return e('span', { className: 'tournament_form_field' },
    e('label', { htmlFor: props.name }, props.label),
    e('select', {
      value: weekday,
      onChange: (event) => {
        setWeekday(parseInt(event.target.value));
        props.changeField(props.name, (new Date(`2022-01-0${weekday + 3}T${time}`).getTime() / 1000))
      }
    }, weekdays.map((day, index) =>
      e('option', {
        value: index,
        key: index
      }, day))),
    e('input', {
      type: 'time',
      value: time,
      onChange: (event) => {
        setTime(event.target.value);
        props.changeField(props.name, (new Date(`2022-01-0${weekday + 3}T${time}`).getTime() / 1000))
      }
    }));
}

function TournamentSelectField(props) {
  return e('span', { className: 'tournament_form_field' },
    e('label', { htmlFor: props.name }, props.label),
    e('select', {
      value: props.value,
      onChange: (event) => props.changeField(props.name, event.target.value)
    },
      props.options.map((option, index) => e('option', {
        value: option.value,
        key: index
      }, option.text))));
}

function TournamentCreation(props) {
  const selectedIds = props.templates.reduce((a, t) => {
    if (t.selected)
      a.push(t.id);
    return a;
  }, []);

  const [creating, setCreating] = React.useState(false);
  const now = new Date();
  const monday = (date) => {
    const d = new Date(date.setDate(date.getDate() - (date.getDay() + 6) % 7))
    d.setUTCHours(0);
    d.setUTCMinutes(0);
    d.setUTCSeconds(0);
    d.setUTCMilliseconds(0);
    return d;
  };
  const nextWeek = (date) => new Date(date.setDate(date.getDate() + 7));
  const nextSunday = (date) => new Date(date.setDate(date.getDate() + 6));

  let m = monday(new Date());
  const [week, setWeek] = React.useState(m.getTime());
  const weeks = [];
  for (let i = 0; i < 6; i++) {
    weeks.push({
      week: m.getTime(),
      name: `${m.toLocaleDateString(undefined, { dateStyle: 'medium' })} – ${nextSunday(m).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
    });
    m = nextWeek(m);
  }

  const createTournaments = (selectedOnly) => {
    setCreating(true);
    fetch(`/api/v1/tournament/create?_xsrf=${xsrf}`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'appication/json'
      },
      body: JSON.stringify({
        week: week / 1000,
        templates: selectedIds.length && selectedOnly ? selectedIds : undefined
      })
    })
      .then(res => res.json())
      .then(res => {
        if (res.success)
          props.onCreated(res);
        else
          alert(`Torunaments not created: ${res.error}`);
      })
      .finally(() => setCreating(false));
  }

  const pastTemplates = props.templates.reduce((a, t, index) => {
    const startDate = (t.startDate - t.startDate % 60)*1000;
    const tournamentStart = week + (startDate - monday(new Date(startDate)).getTime());
    if (tournamentStart < now.getTime())
      a.add(t.id);
    return a;
  }, new Set());

  return e('div', { className: "tournament_creation" },
    e('p', {},
      e('label', {
        htmlFor: 'creation_week'
      }, "Create tournaments for week: "),
      e('select', {
        id: 'creation_week',
        value: week,
        onChange: (event) => setWeek(parseInt(event.target.value))
      }, weeks.map(w => e('option', {
        value: w.week,
        key: w.week,
      }, w.name)))),
    e('button', {
      disabled: props.templates.length == 0 || pastTemplates.size > 0 || creating,
      onClick: () => createTournaments(false)
    }, "Create tournaments for all templates"),
    e('button', {
      disabled: selectedIds.length == 0 || selectedIds.some(i => pastTemplates.has(i)) || creating,
      onClick: () => createTournaments(true)
    }, `Create ${selectedIds.length} tournament${selectedIds.length != 1 ? 's' : ''}  for selected templates`),
    pastTemplates.size > 0 ? e('p', {className: 'error'}, "Some tournaments for this week are already in the past") : null,
  )
}

function CreatedTournaments(props) {
  const pageSize = 20;

  const [tournaments, setTournaments] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState({ request: false, loading: true });

  React.useLayoutEffect(() => {
    if (loading.request)
      return
    setLoading({ request: true, loading: true });
    fetch(`/api/v1/tournament/last`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .catch(() => null)
      .then(res => {
        if (res.tournaments && res.success) {
          setTournaments(res.tournaments);
        }
        setLoading({ request: true, loading: false });
      });
  });

  return e('div', {
    className: 'cretaed_torunaments'
  },
    props.errors.length || props.newTournaments.length ? [
    e('h3', {key:'header'}, "Recently created:"),
    e('ol', {
      className: 'tournament_list',
      key: 'list'
    },
      props.errors.map(err => e('li', {className: 'error', key: err.template.id}, `${err.template.name}: ${err.error}`)),
      props.newTournaments.map(t =>  e(TorunamentLine, {
        key: t.tournament.id,
        tournament: t.tournament,
        highlight: true,
        selectable: false
      })))]:null,
    e('h3', {}, "Created prevoiusly:"),
    e('ol', {
      className: 'tournament_list',
      start: page*pageSize + 1
    },
    loading.loading ? e(Loader, {}) : (tournaments.length == 0 ? "Nothing here" :
      tournaments.slice(page * pageSize, (page + 1) * pageSize).map((t, index) => e(TorunamentLine, {
        key: t.id,
        tournament: t,
        highlight: t.success,
        selectable: true,
        selected: props.selected.has(index+page*pageSize),
        onSelected: () => props.onSelected(index+page*pageSize)
      })))
    ),
    e('button', {
      className: 'button_paging button_left',
      disabled: page == 0,
      onClick: () => setPage(page - 1)
    }, "<"),
    e('button', {
      className: 'button_paging button_right',
      disabled: (page + 1) * pageSize >= tournaments.length,
      onClick: () => setPage(page + 1)
    }, ">"),
  )
}

function TorunamentLine(props) {
  return e('li', {
    className: `tornament_line ${props.tournament.highlight?'highlight':''}`
  },
  props.selectable?e('input', {
    type: 'checkbox',
    className: 'tournament_select',
    checked: props.selected,
    onChange: (event) => { event.stopPropagation(); props.onSelected() }
  }):null,
  e('a', {
    href: `https://lichess.org/${props.tournament.system=='arena'?'tournament':'swiss'}/${props.tournament.id}`
  },
    e('span', {
      className: "tournament_name"
    }, props.tournament.fullName)),
  e('span', {
    className: "tournament_date"
  }, new Date(props.tournament.startsAt).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' , year: 'numeric', month: 'short', day:'numeric', weekday:'short'})
  ))
}

function Loader(props) {
  return e('div', { className: 'lds-roller' }, e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}));
}

document.addEventListener('DOMContentLoaded', () => {
  const domContainer = document.querySelector('#tournament_templates');
  ReactDOM.render(
    e(React.StrictMode, {}, e(TournamentTemplates, {})), domContainer)
});