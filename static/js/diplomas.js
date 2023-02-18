'use strict';

const e = React.createElement;
const PDFJS = window['pdfjs-dist/build/pdf'];
PDFJS.GlobalWorkerOptions.workerSrc = '/static/js/pdf.worker.min.js'

// From https://github.com/kennethjiang/js-file-download/
function DownloadFile(data, filename, mime, bom) {
  var blobData = (typeof bom !== 'undefined') ? [bom, data] : [data]
  var blob = new Blob(blobData, {type: mime || 'application/octet-stream'});
  if (typeof window.navigator.msSaveBlob !== 'undefined') {
      // IE workaround for "HTML7007: One or more blob URLs were
      // revoked by closing the blob for which they were created.
      // These URLs will no longer resolve as the data backing
      // the URL has been freed."
      window.navigator.msSaveBlob(blob, filename);
  }
  else {
      var blobURL = (window.URL && window.URL.createObjectURL) ? window.URL.createObjectURL(blob) : window.webkitURL.createObjectURL(blob);
      var tempLink = document.createElement('a');
      tempLink.style.display = 'none';
      tempLink.href = blobURL;
      tempLink.setAttribute('download', filename);

      // Safari thinks _blank anchor are pop ups. We only want to set _blank
      // target if the browser does not support the HTML5 download attribute.
      // This allows you to download files in desktop safari if pop up blocking
      // is enabled.
      if (typeof tempLink.download === 'undefined') {
          tempLink.setAttribute('target', '_blank');
      }

      document.body.appendChild(tempLink);
      tempLink.click();

      // Fixes "webkit blob resource error 1"
      setTimeout(function() {
          document.body.removeChild(tempLink);
          window.URL.revokeObjectURL(blobURL);
      }, 200)
  }
}

class DiplomaConfiguration extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      addField: 'BackgroundImage',
      name: props.name,
      saving: false
    }
    this.children = [];
    this.canvas = props.canvas;
  }

  static getType(type) {
    return {
      'BackgroundImage': BackgroundImage,
      'ImageField': ImageField,
      'TextField': TextField
    }[type]
  };

  handleChange(fieldKey, newState) {
    let newFields = Object.assign({}, this.props.fields);
    Object.assign(newFields[fieldKey], newState);
    this.props.setFields(newFields);
    this.setState({saving: false});
  };

  handleRemove(fieldKey) {
    let newFields = Object.assign({}, this.props.fields);
    delete newFields[fieldKey];
    this.props.setFields(newFields);
    this.setState({saving: false});
  };

  addField() {
    let newFields = Object.assign({}, this.props.fields);
    let i = 0;
    while (this.props.fields[`${this.state.addField}-${i}`]) i++;
    newFields[`${this.state.addField}-${i}`] = { type: this.state.addField };
    this.props.setFields(newFields);
    this.setState({saving: false});
  }

  save() {
    // TODO: Error reporting
    this.setState({saving: true});
    fetch(`/api/v1/diploma/template/${diploma_template_id}?_xsrf=${xsrf}`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'appication/json'
      },
      body: JSON.stringify({
        name: this.state.name,
        thumbnail: this.canvas.toDataURL({
          format: 'png',
          multiplier: .2
        }),
        fields: this.props.fields,
      })
    }).then(() => {
      this.setState({saving: 'ok'});
    }).catch((err) => {
      this.setState({saving: {error: `Canno save template: ${err}`}});
    })
  };

  renderOnCanvas(canvasObj, substitutions) {
    return Promise.all(this.children.map(
      fieldRef => fieldRef.current ? fieldRef.current.renderOnCanvas(canvasObj, substitutions) : Promise.resolve()
    ));
  }

  render() {
    const fields = {};
    for (const fieldKey in this.props.fields) {
      fields[fieldKey] = Object.assign({}, this.props.fields[fieldKey].type.defaultProps, this.props.fields[fieldKey])
    }
    const childrenElements = [];

    for (const fieldKey in this.props.fields) {
      const ref = React.createRef()
      this.children.push(ref);
      childrenElements.push(
        e(
          DiplomaConfiguration.getType(this.props.fields[fieldKey].type),
          Object.assign(
            {},
            this.props.fields[fieldKey],
            {
              ref: ref,
              key: fieldKey,
              fieldKey: fieldKey,
              handleChange: this.handleChange.bind(this),
              handleRemove: this.handleRemove.bind(this),
              canvas: this.canvas
            })));
    };
    return [
      e('h1', {key: 'header'},  "Diploma template"),
      e('label', { key: 'template-name-label', htmlFor: 'template_name' }, "Name: "),
      e('input', { key: 'template-name-input', id: 'template_name', type: 'text', defaultValue: this.state.name, placeholder: 'Diploma Template 1', onChange: event => { this.setState({ name: event.target.value }) } }),
      e('h3', { key: "diploma_config_header", className: "diploma_config_header" }, "Diploma fields"),
      e('select', { key: "diploma-add-selector", onChange: event => { this.setState({ addField: event.target.value }) } }, [
        e('option', { key: 'BackgroundImage', value: 'BackgroundImage' }, "Background Image"),
        e('option', { key: 'ImageField', value: 'ImageField' }, "Image"),
        e('option', { key: 'TextField', value: 'TextField' }, "Text"),
      ]),
      e('button', { key: "add_btn", onClick: this.addField.bind(this) }, "Add"),
      e('div', { key: "diploma_field_list", className: "diploma_field_list" }, childrenElements),
      e('button', { key: "save_btn", onClick: this.save.bind(this), disabled: this.state.saving === true }, "Save"),
      (this.state.saving === true)? e(LoaderInline, {key: 'savingState'}) : null,
      (this.state.saving === 'ok')? e('span', {key: 'savingState', className: "saving_done"}, 'saved') : null,
      (this.state.saving.error)? e('span', {key: 'savingState', className: "saving_error"}, this.state.saving.error) : null,
    ]
      ;

  }
}

class BackgroundImage extends React.Component {
  static defaultProps = { image: null };

  constructor(props) {
    super(props);
    this.canvas = props.canvas;
  }

  componentWillUnmount() {
    this.canvas.setBackgroundImage(null);
  }

  componentDidMount() {
    this.renderOnCanvas(this.canvas);
  }
  componentDidUpdate() {
    this.renderOnCanvas(this.canvas);
  }

  renderOnCanvas(canvasObj) {
    if (!this.props.image)
      return Promise.resolve();
    return new Promise((resolve, reject) => {
      const imgElement = document.createElement('img');
      imgElement.src = this.props.image;
      imgElement.onload = () => {
        const imageinstance = new fabric.Image(imgElement, {
          angle: 0,
          opacity: 1,
          cornerSize: 30,
          left: 0,
          top: 0,
        });
        imageinstance.scaleToWidth(canvasObj.width);
        canvasObj.setBackgroundImage(imageinstance);
        canvasObj.renderAll();
        resolve();
      }
    })

  }

  render() {
    return e('div', {
      className: 'diploma_field'
    },
      e('a', { href: '#', className: "close", onClick: (event) => { event.preventDefault(); this.props.handleRemove(this.props.fieldKey) } }),
      e('img', {
        src: this.props.image,
        className: 'diploma_image_thumbnail'
      }),
      e('label', {
        htmlFor: "background_image"
      }, "Background: "),
      e('input', {
        id: "background_image",
        type: "file",
        accept: "image/*,application/pdf",
        onChange: (event) => {
          const inputforupload = event.target;
          const readerobj = new FileReader();
          readerobj.onload = () => {
            PDFJS.getDocument(readerobj.result).promise.then( pdf => {
              const canvas = document.createElement('canvas')
              pdf.getPage(1).then(page => {
                var viewport = page.getViewport({ scale: 2, });
                var context = canvas.getContext('2d');

                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                canvas.style.width = Math.floor(viewport.width) + "px";
                canvas.style.height =  Math.floor(viewport.height) + "px";

                var renderContext = {
                  canvasContext: context,
                  transform: null,
                  viewport: viewport
                };
                page.render(renderContext).promise.then(() => {
                  this.props.handleChange(this.props.fieldKey, { image: canvas.toDataURL('image/png') })
                });
              })
            }).catch(() => {
              this.props.handleChange(this.props.fieldKey, { image: readerobj.result });
            })
          };
          readerobj.readAsDataURL(inputforupload.files[0]);
        }
      }),
    )
  }
}

class ImageField extends React.Component {
  static defaultProps = { image: null };

  constructor(props) {
    super(props);
    this.canvas = props.canvas;
  }

  componentWillUnmount() {
    if (this.canvas[this.props.fieldKey]) {
      this.canvas.remove(this.canvas[this.props.fieldKey]);
    }
    delete this.canvas[this.props.fieldKey];
  }

  componentDidMount() {
    this.renderOnCanvas(this.canvas);
  }
  componentDidUpdate() {
    this.renderOnCanvas(this.canvas);
  }

  shouldComponentUpdate(nextProps, nextState) {
    for (const k in nextProps) {
      if (k != 'fabric_props' && nextProps[k] != this.props[k])
        return true;
    }
    return false;
  }
  renderOnCanvas(canvasObj) {
    if (!this.props.image)
      return Promise.resolve;
    return new Promise((resolve, reject) => {
      const imgElement = document.createElement('img');
      imgElement.src = this.props.image;
      imgElement.onload = () => {
        if (!canvasObj[this.props.fieldKey]) {
          const imageObject = new fabric.Image(imgElement,
            Object.assign({
              angle: 0,
              opacity: 1,
              left: 10,
              top: 10,
            }, this.props.fabric_props)
          )
          imageObject.setControlsVisibility({
            tl: true,
            tr: true,
            bl: true,
            br: true,
            mtr: true
          });
          canvasObj.add(imageObject);
          imageObject.on('modified',
            (event) => {
              this.props.handleChange(this.props.fieldKey, { fabric_props: imageObject.toJSON() })
            });
          canvasObj[this.props.fieldKey] = imageObject;
        } else {
          canvasObj[this.props.fieldKey].setElement(imgElement);
          canvasObj.renderAll();
        }
        resolve();
      }
    })
  }

  render() {
    return e('div', {
      className: 'diploma_field'
    },
      e('a', { href: '#', className: "close", onClick: (event) => { event.preventDefault(); this.props.handleRemove(this.props.fieldKey) } }),
      e('img', {
        src: this.props.image,
        className: 'diploma_image_thumbnail'
      }),
      e('label', {
        htmlFor: "image"
      }, "Image: "),
      e('input', {
        id: "image",
        type: "file",
        accept: "image/*",
        onChange: (event) => {
          const inputforupload = event.target;
          const readerobj = new FileReader();
          readerobj.onload = () => {
            this.props.handleChange(this.props.fieldKey, { image: readerobj.result });
          };
          readerobj.readAsDataURL(inputforupload.files[0]);
        }
      }
      ))
  }
}

class TextField extends React.Component {
  static defaultProps = {
    font: "Sans",
    font_size: 24,
    text: "Example Text",
    color: '#000'
  };

  static commonSubstitutions = [
    '${player.profile.firstName}',
    '${player.profile.lastName}',
    '${player.name}',
    '${player.rank}',
    '${tournament.nbPlayers}',
    '${tournament.date}',
    '${tournament.fullName}',
    '${tournament.description}',
  ];

  constructor(props) {
    super(props);
    this.canvas = props.canvas;
    this.state = {
      chosenSubst: props.chosenSubst
    };
  }

  static getDeep(obj, path) {
    return path.split(".").reduce((o, key) => o && o[key] ? o[key] : null, obj);
  }

  componentWillUnmount() {
    if (this.canvas[this.props.fieldKey]) {
      this.canvas.remove(this.canvas[this.props.fieldKey]);
    }
    delete this.canvas[this.props.fieldKey];
  }

  componentDidMount() {
    this.renderOnCanvas(this.canvas);
  }
  componentDidUpdate() {
    this.renderOnCanvas(this.canvas);
  }

  makeSubstitutions(text, substitutions) {
    if (!substitutions)
      return text;
    const regex = /\$\{([a-zA-Z.]+)\}/ig;
    return text.replaceAll(regex, (match, p1) => {
      let replacement = TextField.getDeep(substitutions, p1);
      if (p1 == 'tournament.date')
        replacement = (new Date(substitutions.tournament.startsAt)).toLocaleDateString();
      if (!replacement)
        replacement = '';
      return replacement;
    });
  }

  renderOnCanvas(canvasObj, substitutions) {
    const text = this.makeSubstitutions(this.props.text, substitutions);
    if (!canvasObj[this.props.fieldKey]) {
      const textBox = new fabric.Text(
        text,
        Object.assign({
          left: canvasObj.width / 2,
          originX: 'center',
          top: canvasObj.height * .39,
          selectable: true,
          hasControls: true,
          hasBorders: true
        }, this.props.fabric_props, {
          fontFamily: this.props.font,
          fontSize: this.props.font_size,
          text: text
        })
      )
      textBox.set('fill', this.props.color);
      textBox.setControlsVisibility({
        tl: true,
        tr: true,
        bl: true,
        br: true,
        mtr: true
      });
      canvasObj.add(textBox);
      textBox.on('modified',
        (event) => {
          this.props.handleChange(this.props.fieldKey, { fabric_props: textBox.toJSON() })
        });
      canvasObj[this.props.fieldKey] = textBox;
    } else {
      const textBox = canvasObj[this.props.fieldKey];
      textBox.text = text;
      textBox.fontFamily = this.props.font;
      textBox.fontSize = this.props.font_size;
      textBox.set('fill', this.props.color)
      canvasObj.renderAll();
    }
    return Promise.resolve();
  }

  render() {
    return e('div', {
      className: 'diploma_field',
    },
      e('a', { href: '#', className: "close", onClick: (event) => { event.preventDefault(); this.props.handleRemove(this.props.fieldKey) } }),
      e('label', {
        htmlFor: "font"
      }, "Font: "),
      e('input', {
        id: "font",
        type: "text",
        defaultValue: this.props.font,
        className: "font_input",
        onChange: (event) => { this.props.handleChange(this.props.fieldKey, { font: event.target.value }); }
      }),
      e('input', {
        id: "font_size",
        type: "number",
        defaultValue: this.props.font_size,
        onChange: (event) => { this.props.handleChange(this.props.fieldKey, { font_size: event.target.value }); }
      }),
      e('input', {
        id: "color",
        type: "color",
        defaultValue: this.props.color,
        onChange: (event) => { this.props.handleChange(this.props.fieldKey, { color: event.target.value }); }
      }),
      e('br'),
      e('label', {
        htmlFor: "text"
      }, "Text: "),
      e('input', {
        id: "text",
        type: "text",
        className: "text_input",
        value: this.props.text,
        onChange: (event) => { this.props.handleChange(this.props.fieldKey, { text: event.target.value }); }
      }),
      e('br'),
      e('select', {
        className: "select_input",
        onChange: (event) => {
          this.setState({ chosenSubst: event.target.value });
        }
      },
        e('option', {
          key: `sub-null`,
          value: '',
        }, "Possible substitutions…"),
        TextField.commonSubstitutions.map((sub, index) => {
          return e('option', {
            key: `sub-${index}`,
            value: sub,
          }, sub)
        })),
      e('button', {
        disabled: this.state.chosenSubst ? null : true,
        onClick: () => {
          if (this.state.chosenSubst)
            this.props.handleChange(this.props.fieldKey, { text: this.props.text + this.state.chosenSubst });
        }
      }, "Add")
    )
  }
}

class TournamentsList extends React.Component {
  constructor(props) {
    super(props);
    this.state = { tournaments: props.tournaments };
  }

  addTournament(url) {
    if (this.state.tournaments.indexOf(url) != -1)
      return
    const t = this.state.tournaments.slice()
    t.push(url);
    this.setState({ tournaments: t });
  }

  onAdd() {
    this.addTournament(this.state.new_url);
  }

  onDelete(index) {
    const t = this.state.tournaments;
    t.splice(index, 1);
    this.setState({ tournaments: t });
  }

  render() {
    return e('div', {
      className: 'tournament_list'
    },
      e('input', {
        type: 'url',
        key: 'url-input',
        onChange: (e) => this.setState({ new_url: e.target.value })
      }),
      e('button', {
        key: 'url-button',
        onClick: this.onAdd.bind(this)
      }, "Add"),
      this.state.tournaments.length ?
        e('ol', {},
          this.state.tournaments.map((url, index) => e(TournamentLine, {
            url: url,
            id: index,
            key: index,
            onDelete: this.onDelete.bind(this),
            canvas: this.props.canvas,
            fieldsRef: this.props.fieldsRef
          }))
        ) : e('p', {}, "No tournaments"),
    )
  }
}

function TournamentLine(props) {
  const [loading, setLoading] = React.useState({ request: false, loading: true });
  const [tournament, setTournament] = React.useState({});
  React.useLayoutEffect(() => {
    if (loading.request)
      return
    setLoading({ request: true, loading: true });
    fetch(`/api/v1/tournament?${new URLSearchParams({ tournament: props.url })}&results=1`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          delete res.success;
          res.date = (new Date(res.startsAt)).toDateString(),
            setTournament(res);
          setLoading({ request: true, loading: false });
        } else {
          alert("Invalid tournament URL")
          props.onDelete(props.id);
        }
      });
  });
  return loading.loading ? e(Loader, {}) : e('li', {
    className: 'tournament_line',
  },
    e('b', {}, tournament.fullName),
    " at ",
    e('em', {}, tournament.date),
    e('br', {}),
    e('span', {
      className: 'close tournament_line_close',
      onClick: (e) => { props.onDelete(props.id) }
    }),
    e(DiplomasLine, {
      canvas: props.canvas,
      fieldsRef: props.fieldsRef,
      tournament: tournament,
    }))
}

function DiplomasLine(props) {
  React.useEffect(() => {
    if (!props.fieldsRef.current)
      return;
    props.tournament.standing.players.forEach(player => {
      const canvasElement = document.getElementById(`canvas-${props.tournament.id}-${player.rank}`);
      const canvasObj = new fabric.StaticCanvas(canvasElement);
      canvasObj.setDimensions(
        {
          width: props.canvas.getWidth(),
          height: props.canvas.getHeight()
        });
      canvasObj.setZoom(.3033);
      props.fieldsRef.current.renderOnCanvas(canvasObj, {
        tournament: props.tournament,
        player: player
      });
    })
  });

  const renderDiploma = (player) => {
    const tempCanvas = new fabric.StaticCanvas(document.createElement('canvas'));
    tempCanvas.setDimensions(
      {
        width: props.canvas.getWidth(),
        height: props.canvas.getHeight()
      });
    return props.fieldsRef.current.renderOnCanvas(tempCanvas, {
      tournament: props.tournament,
      player: player
    }).then(() => {
      tempCanvas.setDimensions(
        {
          width: props.canvas.getWidth() * 4,
          height: props.canvas.getHeight() * 4
        });
      tempCanvas.setZoom(4);
      return tempCanvas;
    });
  }

  const DownloadDiploma = (player) => {
    renderDiploma(player).then((tempCanvas) => {
      fetch(tempCanvas.toDataURL()).then(res => res.blob()).then(blob => {
        const date = new Date(props.tournament.startsAt);
        DownloadFile(blob, `${date.getFullYear()}-${date.getMonth().toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}-${props.tournament.fullName}-${player.rank}.png`, 'image/png');
      });
    });
  }

  return e('div', {},
    e('a', {
      className: 'diploma_download_all',
      onClick: (evt) => {
        evt.preventDefault();
        props.tournament.standing.players.forEach(player => {
          DownloadDiploma(player);
        });
      }
    }, 'Download all'),
    props.tournament.standing.players.map(player => {
      return e('a', {
        className: "diploma_preview_canvas",
        key: `canvas-${props.tournament.id}-${player.rank}`,
        onClick: (evt) => {
          evt.preventDefault();
          renderDiploma(player).then((tempCanvas) => {
            const newWindow = window.open("")
            newWindow.document.write(`<img src="${tempCanvas.toDataURL()}">`);
          });
        }
      },
        e('canvas', { id: `canvas-${props.tournament.id}-${player.rank}` }),
        e('div', {
          className: 'download_icon',
          onClick: (evt) => {
            evt.stopPropagation();
            DownloadDiploma(player);
          }}))
    }));
}

function Diplomas(props) {
  const fieldsRef = React.createRef();
  const [fields, setFields] = React.useState({})
  const [name, setName] = React.useState('');
  const [loading, setLoading] = React.useState({ request: false, loading: true });
  const tournaments = (new URLSearchParams(window.location.search)).getAll('u');

  React.useLayoutEffect(() => {
    if (loading.request)
      return
    setLoading({ request: true, loading: true });
    fetch(`/api/v1/diploma/template/${props.diploma_template_id}`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .catch(() => null)
      .then(config => {
        if (!config || !config.success) {
          setFields({
            'BackgroundImage-0': { type: 'BackgroundImage' },
            'TextField-0': { type: 'TextField' },
          })
        } else {
          setName(config.name);
          setFields(config.fields)
        }
        setLoading({ request: true, loading: false });
      });
  });

  return loading.loading ? e(Loader, {}) : [
    e('div', { id: 'diploma_fields', key: 'diploma_fields' },
      e(DiplomaConfiguration, {
        ref: fieldsRef,
        setFields: (f) => {
          setFields(f);
        },
        fields: fields,
        canvas: props.canvas,
        name: name
      })),
    e('div', { id: 'tournament_list', key: 'tournament_list' },
      e('h3', {}, "Apply to tournaments"),
      e('div', { id: 'tournaments' },
        e(TournamentsList, {
          canvas: props.canvas,
          fieldsRef: fieldsRef,
          tournaments: tournaments
        }))
    )]
}

function Loader(props) {
  return e('div', { className: 'lds-roller' }, e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}), e('div', {}));
}


function LoaderInline(props) {
  return e('div', { className: 'lds-inline', width: props.width, height: props.height }, e('div', {}), e('div', {}), e('div', {}));
}

document.addEventListener('DOMContentLoaded', () => {
  const domContainer = document.querySelector('#diplomas');
  const canvasObj = new fabric.Canvas(document.getElementById('diploma_canvas'));
  ReactDOM.render(
    e(React.StrictMode, {}, e(Diplomas, { canvas: canvasObj, diploma_template_id: diploma_template_id })), domContainer)
});