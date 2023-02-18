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
      const template = templates.find(t => t.id == templateId);
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
  const onSelectedTournament = (tournament) => {
    const s = new Set(selected);
    if (!s.has(tournament))
      s.add(tournament);
    else
      s.delete(tournament);
    setSelected(s);
  }

  const dragItem = React.useRef()
  const dragOverItem = React.useRef()

  const startDrag = (event, index) => {
    dragItem.current = index
  }

  const dragEnter = (event, index) => {
    dragOverItem.current = index
  }

  const dragDrop = (event) => {
    templates.forEach((template, index) => template.oldIndex = index)
    const element = templates[dragItem.current]
    const newList = [...templates]
    newList.splice(dragItem.current, 1)
    newList.splice(dragOverItem.current, 0, element)
    Promise.all(
      newList.map((
        template, index) => onEdit(template.oldIndex, {...template, index}))
    ).then(() => setTemplates(newList)).catch(console.error)
  }


  return loading.loading ? e(Loader, {}) :
    e('div', { id: 'application_root' },
      e('div', { className: 'current_templates' },
        e('div', {id: 'logout', className: 'logout'},
          e('span', {}, `${username} `),
          e('a', { href: `/logout?_xsrf=${xsrf}`}, 'logout')),
        e('h1', {}, "Tournament templates"),
        e('ol', { className: 'template_list' },
          templates.map((template, index) => e(TemplateBox, {
            key: template['id'],
            index: index,
            template: template,
            expanded: index == expandedIndex,
            teams: teams,
            onStartDrag: startDrag,
            onDragEnter: dragEnter,
            onDragDrop: dragDrop,
            onSelected: () => onSelectedTemplate(index),
            onEdit: (template) => onEdit(index, template),
            onDelete: () => onDelete(index),
            onClick: () => setExpanded(index == expandedIndex ? null : index),
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
          }),
        ),
        e(TournamentCreation, {
          templates: templates,
          onCreated: onCreated
        }),
      ),
      e(CreatedTournaments, {
        newTournaments: created,
        errors: errors,
        selected: selected,
        onSelected: onSelectedTournament
      }),
      e(DiplomaTemplates, {
        selectedTournaments: selected
      })
    )
}

function TemplateBox(props) {
  return e('li', {
    className: `tournament_short ${props.expanded ? 'expanded' : ''}`,
  },
    e('div', {
      className: 'tournament_header',
      onClick: props.onClick,
      draggable: true,
      onDragStart: e => props.onStartDrag(e, props.index),
      onDragEnter: e => props.onDragEnter(e, props.index),
      onDragEnd: props.onDragDrop,
    },
      props.empty ? null : e('a', { href: '#', className: 'close', onClick: (event) => { event.preventDefault(); props.onDelete(props.index) } }),
      props.empty ? null : e('input', {
        type: 'checkbox',
        className: 'tournament_select',
        defaultChecked: Boolean(props.template.selected),
        onClick: (event) => { event.stopPropagation(); props.onSelected() }
      }),
      e('span', {
        className: "tournament_name",
      }, props.empty ? "Create new template" : props.template.name),
      props.empty ? null : e('span', {
        className: "tournament_date"
      }, moment.tz(`2022-01-0${props.template.startDate.weekday + 3}T${props.template.startDate.wall_time}:00`, props.template.startDate.timezone).format('dddd HH:mm z'))),
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
  const copyFromLichess = () => {
    fetch(`/api/v1/tournament?${new URLSearchParams({ tournament: prototypeURL })}`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          delete res.success;
          if (res.type == 'arena') {
            const timezone = moment.tz.guess()
            const startDate = moment.utc(res.startsAt).tz(timezone);
            res.startDate = {
              weekday: (startDate.weekday() + 6) % 7, // Convert from Sunday-starting to Monday-starting
              wall_time: startDate.format('HH:mm'),
              timezone: timezone
            }
            res.name = res.fullName.endsWith(" Arena") ? res.fullName.slice(0, -6) : res.fullName;
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
          } else if (res.type == 'swiss') {
            const timezone = moment.tz.guess()
            const startDate = moment(res.startsAt).tz(timezone);
            res.startDate = {
              weekday: (startDate.weekday() + 6) % 7, // Convert from Sunday-starting to Monday-starting
              wall_time: startDate.format('HH:mm'),
              timezone: timezone
            }
            res['clock.limit'] = parseInt(res.clock.limit);
            res['clock.increment'] = parseInt(res.clock.increment);
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

  const [prototypeURL, setPrototypeURL] = React.useState('');
  const [fields, setFields] = React.useState(Object.assign({
    type: 'arena',
    // Common fields
    startDate: {
      weekday: 0,
      wall_time: "12:00",
      timezone: moment.tz.guess()
    },
    variant: 'standard',
    rated: true,
    name: 'Untitled',
    description: '',
    password: '',
    'conditions.minRating.rating': 0,
    'conditions.maxRating.rating': 0,
    'conditions.nbRatedGame.nb': 0,
    // Arena specific
    clockTime: 30,
    clockIncrement: 30,
    minutes: 60,
    berserkable: true,
    streakable: true,
    hasChat: true,
    'conditions.teamMember.teamId': '',
    // Swiss specific
    'clock.limit': 600,
    'clock.increment': 0,
    nbRounds: 8,
    roundInterval: 10,
    forbiddenPairings: '',
    teamId: props.teams && props.teams.length ? props.teams[0].id : '',
    chatFor: 20
  }, props.fields));

  const changeField = (key, value) => {
    setFields(Object.assign({
    }, fields, Object.fromEntries([[key, value]])))
  }

  let typeSpecificEditor = null;
  if (fields.type === 'arena') {
    typeSpecificEditor =  e(ArenaTemplateEditor, Object.assign({}, props, {
      changeField: changeField,
      copyFromLichess: copyFromLichess,
      fields: fields,
    }));
  } else if (fields.type === 'swiss') {
    typeSpecificEditor =  e(SwissTemplateEditor, Object.assign({}, props, {
      changeField: changeField,
      copyFromLichess: copyFromLichess,
      fields: fields
    }));
  } else {
    typeSpecificEditor = e('p', {} `Unsupported template type "${tournamentType}"`);
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
        { value: 'arena', text: "Arena" },
        { value: 'swiss', text: "Swiss" }
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
    typeSpecificEditor,
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
    }, "Cancel"));
}

function ArenaTemplateEditor(props) {
  return [
    e(TournamentSelectField, {
      name: 'clockTime', key: 'clockTime',
      label: "Clock time",
      options: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 10, 15, 20, 25, 30, 40, 50, 60].map((time) => ({ value: time, text: `${time} min` })),
      value: props.fields.clockTime,
      changeField: props.changeField
    }),
    e(TournamentNumberField, {
      name: 'clockIncrement', key: 'clockIncrement',
      label: "Clock increment",
      min: 0, max: 60, unit: "sec",
      value: props.fields.clockIncrement,
      changeField: props.changeField
    }),
    e(TournamentSelectField, {
      name: 'minutes', key: 'minutes',
      label: "Tournament length",
      options: [20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, 480, 540, 600, 720].map((time) => ({ value: time, text: `${time} min` })),
      value: props.fields.minutes,
      changeField: props.changeField
    }),
    e(TournamentCheckboxField, {
      name: 'berserkable', key: 'berserkable',
      label: "Berserkable",
      value: props.fields.berserkable,
      changeField: props.changeField
    }),
    e(TournamentCheckboxField, {
      name: 'streakable', key: 'streakable',
      label: "Streakable",
      value: props.fields.streakable,
      changeField: props.changeField
    }),
    e(TournamentCheckboxField, {
      name: 'hasChat', key: 'hasChat',
      label: "Has chat",
      value: props.fields.hasChat,
      changeField: props.changeField
    }),
    e(TournamentSelectField, {
      name: 'conditions.teamMember.teamId', key: 'conditions.teamMember.teamId',
      label: "Restrict to team members of",
      options:
        props.teams == null || props.teams == 'loading' ?
          [{ value: '', text: `Loading…` }] : (props.teams == 'error' ?
            [{ value: '', text: `Error loading teams` }] :
            [{ value: '', text: `No restriction` }].concat(props.teams.map(team => ({
              value: team.id, text: team.name
            })))
          ),
      value: props.fields['conditions.teamMember.teamId'],
      changeField: props.changeField
    }),
]
}

function SwissTemplateEditor(props) {
  return [
    e(TournamentSelectField, {
      name: 'teamId', key: 'teamId',
      label: "Team",
      options:
        props.teams == null || props.teams == 'loading' ?
          [{ value: '', text: `Loading…` }] : (props.teams == 'error' ?
            [{ value: '', text: `Error loading teams` }] : ( props.teams.length ?
            props.teams.map(team => ({
              value: team.id, text: team.name
            })) : {value: '', text: 'You have to be a team leader to create swiss tournaments'})
          ),
      value: props.fields.teamId,
      changeField: props.changeField
    }),
    e(TournamentSelectField, {
      name: 'clock.limit', key: 'clock.limit',
      label: "Clock time",
      options: [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 600, 900, 1200, 1500, 1800, 2400, 3000, 3600].map((time) => ({ value: time, text: `${time} sec` })),
      value: props.fields['clock.limit'],
      changeField: props.changeField
    }),
    e(TournamentNumberField, {
      name: 'clock.increment', key: 'clock.increment',
      label: "Clock increment",
      min: 0, max: 600, unit: "sec",
      value: props.fields['clock.increment'],
      changeField: props.changeField
    }),
    e(TournamentNumberField, {
      name: 'nbRounds', key: 'nbRounds',
      label: "Rounds",
      min: 3, max: 100, unit: "",
      value: props.fields.nbRounds,
      changeField: props.changeField
    }),
    e(TournamentSelectField, {
      name: 'roundInterval', key: 'roundInterval',
      label: "Interval between rounds",
      options: [
        {value: -1, text: 'Default'},
        {value: 5, text: '5 sec'},
        {value: 10, text: '10 sec'},
        {value: 20, text: '20 sec'},
        {value: 30, text: '30 sec'},
        {value: 45, text: '45 sec'},
        {value: 60, text: '1 min'},
        {value: 120, text: '2 min'},
        {value: 180, text: '3 min'},
        {value: 300, text: '5 min'},
        {value: 600, text: '10 min'},
        {value: 900, text: '15 min'},
        {value: 1200, text: '20 min'},
        {value: 1800, text: '30 min'},
        {value: 2700, text: '45 min'},
        {value: 3600, text: '1 hour'},
        {value: 86400, text: '1 day'},
        {value: 172800, text: '2 days'},
        {value: 604800, text: '1 week'},
        {value: 99999999, text: 'Manually schedule rounds'},
      ],
      value: props.fields.roundInterval,
      changeField: props.changeField
    }),
    e(TournamentSelectField, {
      name: 'chatFor', key: 'chatFor',
      label: "Chat for",
      value: props.fields.chatFor,
      options: [
        { value: 0, text: "Nobody"},
        { value: 10, text: "Only team leaders"},
        { value: 20, text: "Only team members"},
        { value: 30, text: "All Lichess players"},
      ],
      changeField: props.changeField
    })
  ]
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
      disabled: props.disabled,
      onChange: (event) => props.changeField(props.name, event.target.value)
    }), props.unit);
}

function TournamentDatetimeField(props) {
  const [weekday, setWeekday] = React.useState(props.value.weekday);
  const [time, setTime] = React.useState(props.value.wall_time);
  const [timezone, setTimezone] = React.useState(props.value.timezone || "Etc/UCT");
  const uniqTZ = (zones) => {
    const seen = {};
    return zones.filter((tz) => seen.hasOwnProperty(tz.abbr) ? false : (seen[tz.abbr] = true));
  }
  const zones = uniqTZ(moment.tz.names().map((n) => ({
    name: n,
    zone: moment.tz(n),
    abbr: moment.tz(n).zoneName()
  }))).sort((a,b) => a.abbr > b.abbr);

  // To update values on props change
  React.useEffect(() => {
    setWeekday(props.value.weekday);
    setTime(props.value.wall_time);
    setTimezone(props.value.timezone);
  }, [props.value])

  return e('span', { className: 'tournament_form_field' },
    e('label', { htmlFor: props.name }, props.label),
    e('select', {
      value: weekday,
      onChange: (event) => {
        const newWeekday = parseInt(event.target.value);
        setWeekday(newWeekday);
        props.changeField(props.name, { wall_time: time, weekday: newWeekday, timezone: timezone })
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
        props.changeField(props.name, { wall_time: event.target.value, weekday: weekday, timezone: timezone })
      }
    }),
    e('select', {
      value: timezone,
      onChange: (event) => {
        setTimezone(event.target.value);
        props.changeField(props.name, { wall_time: time, weekday: weekday, timezone: event.target.value })      }
    }, zones.map((tz) =>
      e('option', {
        value: tz.name,
        key: tz.name
      }, tz.abbr))),
    );
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

  let m = moment().utc().subtract(1, 'day').startOf('isoWeek');
  const [week, setWeek] = React.useState(m.valueOf());
  const weeks = [];
  for (let i = 0; i < 6; i++) {
    weeks.push({
      week: m.valueOf(),
      name: `${m.format('ll')} – ${moment(m).endOf('isoWeek').format('ll')}`
    });
    m.add(1, 'week');
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
    const now = moment().tz('Etc/UCT');
    const wallTime = moment(t.startDate.wall_time, 'HH:mm');
    const tournamentStart = moment.tz(week, t.startDate.timezone).add(t.startDate.weekday, 'days').hour(wallTime.hour()).minute(wallTime.minute()).tz('Etc/UCT');
    if (tournamentStart.isBefore(now))
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
    pastTemplates.size > 0 ? e('p', { className: 'error' }, "Some tournaments for this week are already in the past") : null,
  )
}

function CreatedTournaments(props) {
  const pageSize = 16;

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
    className: 'created_tournaments'
  },
    e('h1', {}, "Created tournaments"),
    props.errors.length || props.newTournaments.length ? [
      e('h3', { key: 'header' }, "Recently created:"),
      e('ol', {
        className: 'tournament_list',
        key: 'list'
      },
        props.errors.map(err => e('li', { className: 'error', key: err.template.id }, `${err.template.name}: ${err.error}`)),
        props.newTournaments.map(t => e(TorunamentLine, {
          key: t.tournament.id,
          tournament: t.tournament,
          highlight: true,
          selectable: false
        })))] : null,
    e('h3', {}, "Created prevoiusly:"),
    e('ol', {
      className: 'tournament_list',
      start: page * pageSize + 1
    },
      loading.loading ? e(Loader, {}) : (tournaments.length == 0 ? "Nothing here" :
        tournaments.slice(page * pageSize, (page + 1) * pageSize).map((t, index) => e(TorunamentLine, {
          key: t.id,
          tournament: t,
          highlight: t.success,
          selectable: true,
          selected: props.selected.has(t),
          onSelected: () => props.onSelected(t)
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

function getTournamentURL(tournament) {
  return `https://lichess.org/${tournament.system == 'arena' ? 'tournament' : 'swiss'}/${tournament.id}`
}

function TorunamentLine(props) {
  return e('li', {
    className: `tournament_list_line ${props.tournament.highlight ? 'highlight' : ''}`
  },
    props.selectable ? e('input', {
      type: 'checkbox',
      className: 'tournament_select',
      checked: props.selected,
      onChange: (event) => { event.stopPropagation(); props.onSelected() }
    }) : null,
    props.tournament.fullName || props.tournament.name, " ",
    e('span', {
      className: "tournament_date"
    }, new Date(props.tournament.startsAt).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })
    ),
    e('br',{}),
    e('a', {
      href: getTournamentURL(props.tournament)
    },
      e('span', {
        className: "tournament_name"
      }, getTournamentURL(props.tournament))),

    )
}

function DiplomaTemplates(props) {
  const [diplomas, setDiplomas] = React.useState([]);
  const [loading, setLoading] = React.useState({ request: false, loading: true });

  React.useLayoutEffect(() => {
    if (loading.request)
      return
    setLoading({ request: true, loading: true });
    fetch(`/api/v1/diploma/template/`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .catch(() => null)
      .then(res => {
        if (res.templates && res.success) {
          setDiplomas(res.templates);
        }
        setLoading({ request: true, loading: false });
      });
  });

  const onDelete = (template) => {
    if (!window.confirm(`Do you want to delete template: ${template.name}`))
      return;
    fetch(`/api/v1/diploma/template/${template.id}?_xsrf=${xsrf}`, {
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

  const onApply = (template) => {
    window.location.href = `/diplomas/edit/${template.id}?${(new URLSearchParams(Array.from(props.selectedTournaments).map(tournament => ['u', getTournamentURL(tournament)]))).toString()}`;
  }

  return e('div', {
    className: 'diploma_templates'
  },
    e('h1', {}, "Diploma templates"),
    e('ol', {
      className: 'diploma_list',
    },
      loading.loading ? e(Loader, {}) : (diplomas.length == 0 ? "Nothing here" :
        diplomas.map(t => e('li', {
          className: 'diploma_template',
          key: t.id
        },
          e('a', {
            href: `/diplomas/edit/${t.id}`
          },
            t.name ? t.name : "Unnamed",
            e('br', {}),
            e('img', {
              src: t.thumbnail
            }),
            e('br', {}),
          ),
          e('button', {
            disabled: props.selectedTournaments.size == 0,
            onClick: () => onApply(t)
          }, "Apply to", e('br', {}), "selected"),
          e('br', {}),
          e('button', {
            onClick: () => onDelete(t)
          }, "Delete"))))),
    e('button', {
      onClick: () => { window.location = '/diplomas/add'; }
    }, "Add diploma template")
  )
}

function Loader(props) {
  return e('div', { className: 'lds-roller' }, e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}));
}

document.addEventListener('DOMContentLoaded', () => {
  const domContainer = document.querySelector('#tournament_templates');
  ReactDOM.render(
    e(React.StrictMode, {}, e(TournamentTemplates, {})), domContainer)
});