'use strict';

const e = React.createElement;

class DiplomaConfiguration extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      fields: props.fields,
      addField: 'BackgroundImage',
      name: props.name
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
    let newFields = Object.assign({}, this.state.fields);
    Object.assign(newFields[fieldKey], newState);
    this.setState({ fields: newFields });
  };

  handleRemove(fieldKey) {
    let newFields = Object.assign({}, this.state.fields);
    delete newFields[fieldKey];
    this.setState({ fields: newFields });
  };

  addField() {
    let newFields = Object.assign({}, this.state.fields);
    let i = 0;
    while (this.state.fields[`${this.state.addField}-${i}`]) i++;
    newFields[`${this.state.addField}-${i}`] = { type: this.state.addField };
    this.setState({ fields: newFields });
  }

  save() {
    // TODO: Error reporting
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
        fields: this.state.fields,
      })
    })
  };

  renderOnCanvas(canvasObj) {
    return Promise.all(this.children.map(
      fieldRef => fieldRef.current?fieldRef.current.renderOnCanvas(canvasObj):Promise.resolve()
    ));
  }

  render() {
    const fields = {};
    for (const fieldKey in this.state.fields) {
      fields[fieldKey] = Object.assign({}, this.state.fields[fieldKey].type.defaultProps, this.state.fields[fieldKey])
    }
    const childrenElements = [];

    for (const fieldKey in this.state.fields) {
      const ref = React.createRef()
      this.children.push(ref);
      childrenElements.push(
        e(
          DiplomaConfiguration.getType(this.state.fields[fieldKey].type),
          Object.assign(
            {},
            this.state.fields[fieldKey],
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
      e('label', { key: 'template-name-label', htmlFor: 'template_name' }, "Name: "),
      e('input', { key: 'template-name-input', id: 'template_name', type: 'text', value: this.state.name, placeholder: 'Diploma Template 1', onChange: event => { this.setState({ name: event.target.value }) } }),
      e('h3', { key: "diploma_config_header", className: "diploma_config_header" }, "Diploma fields"),
      e('select', { key: "diploma-add-selector", onChange: event => { this.setState({ addField: event.target.value }) } }, [
        e('option', { key: 'BackgroundImage', value: 'BackgroundImage' }, "Background Image"),
        e('option', { key: 'ImageField', value: 'ImageField' }, "Image"),
        e('option', { key: 'TextField', value: 'TextField' }, "Text"),
      ]),
      e('button', { key: "add_btn", onClick: this.addField.bind(this) }, "Add"),
      e('div', { key: "diploma_field_list", className: "diploma_field_list" }, childrenElements),
      e('button', { key: "save_btn", onClick: this.save.bind(this) }, "Save")
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
    this.renderOnCanvas(this.canvas);
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
        accept: "image/*",
        onChange: (event) => {
          const inputforupload = event.target;
          const readerobj = new FileReader();
          readerobj.onload = () => {
            this.props.handleChange(this.props.fieldKey, { image: readerobj.result });
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
          imageObject.scaleToWidth(canvasObj.width * .7);
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
    this.renderOnCanvas(this.canvas);
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

  constructor(props) {
    super(props);
    this.canvas = props.canvas;
  }

  shouldComponentUpdate(nextProps, nextState) {
    for (const k in nextProps) {
      if (k != 'fabric_props' && nextProps[k] != this.props[k])
        return true;
    }
    return false;
  }

  renderOnCanvas(canvasObj) {
    if (!canvasObj[this.props.fieldKey]) {
      const textBox = new fabric.Text(
        this.props.text,
        Object.assign({
          left: canvasObj.width / 2,
          originX: 'center',
          top: canvasObj.height * .39,
          fontFamily: this.props.font,
          fontSize: this.props.font_size,
          selectable: true,
          hasControls: true,
          hasBorders: true
        }, this.props.fabric_props)
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
      textBox.text = this.props.text;
      textBox.fontFamily = this.props.font;
      textBox.fontSize = this.props.font_size;
      textBox.set('fill', this.props.color)
      canvasObj.renderAll();
    }
    return Promise.resolve();
  }

  render() {
    this.renderOnCanvas(this.canvas);
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
        defaultValue: this.props.text,
        onChange: (event) => { this.props.handleChange(this.props.fieldKey, { text: event.target.value }); }
      }),
    )
  }
}

class TournamentsList extends React.Component {
  constructor(props) {
    super(props);
    this.state = { tournaments: props.tournaments };
    if (!this.state.tournaments)
      this.state.tournaments = [];
  }

  onAdd() {
    fetch(`/api/v1/tournament?${new URLSearchParams({ tournament: this.state.new_url })}`, {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          if (!this.state.tournaments.every(t => t.id != res.id)) {
            return
          }
          const t = this.state.tournaments;
          t.push(res);
          this.setState({ tournaments: t });
        } else {
          alert("Invalid tournament URL")
        }
      });

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
          this.state.tournaments.map((tournament, index) => e(TournamentLine, {
            name: tournament.fullName,
            date: (new Date(tournament.startsAt)).toDateString(),
            id: index,
            key: index,
            onDelete: this.onDelete.bind(this)
          }))
        ) : e('p', {}, "No tournaments"),
      e('div', {
        className: 'diplomas_container',
        key: 'diplomas',
      },
        this.state.tournaments.map((tournament) => e(DiplomasLine, {
          key: tournament.id,
          canvas: this.props.canvas,
          fieldsRef: this.props.fieldsRef,
          tournament: tournament,
        }))
      )
    )
  }
}

function TournamentLine(props) {
  return e('li', {
    className: 'tournament_line',
  },
    e('b', {}, props.name),
    " at ",
    e('em', {}, props.date),
    e('span', {
      className: 'close tournament_line_close',
      onClick: (e) => { props.onDelete(props.id) }
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
      props.fieldsRef.current.renderOnCanvas(canvasObj);
    })
  });
  return props.tournament.standing.players.map(player => {
    return e('a', {
        className:"diploma_preview_canvas",
        key: `canvas-${props.tournament.id}-${player.rank}`,
        onClick: (event) => {
          const tempCanvas = new fabric.StaticCanvas(document.createElement('canvas'));
          tempCanvas.setDimensions(
            {
              width: props.canvas.getWidth(),
              height: props.canvas.getHeight()
            });
          props.fieldsRef.current.renderOnCanvas(tempCanvas).then(() => {
            tempCanvas.setDimensions(
              {
                width: props.canvas.getWidth()*4,
                height: props.canvas.getHeight()*4
              });
            tempCanvas.setZoom(4);
            window.open(tempCanvas.toDataURL(), '_blank').focus()
          });
        }
      },
      e('canvas', {id: `canvas-${props.tournament.id}-${player.rank}`}))
  });
}

function Diplomas(props) {
  const fieldsRef = React.createRef();

  return [
    e('div', {id:'diploma_fields', key: 'diploma_fields'},
      e(DiplomaConfiguration, Object.assign({ref: fieldsRef},props))),
    e('div', {id:'tournament_list', key: 'tournament_list'},
      e('h3', {}, "Apply to tournaments"),
      e('div', {id:'tournaments'},
        e(TournamentsList, {
          canvas: props.canvas,
          fieldsRef: fieldsRef
        }))
    )]

}

document.addEventListener('DOMContentLoaded', () => {
  const domContainer = document.querySelector('#diplomas');
  const canvasObj = new fabric.Canvas(document.getElementById('diploma_canvas'));
  fetch(`/api/v1/diploma/template/${diploma_template_id}`, {
    credentials: 'include',
  })
    .then(res => res.json())
    .catch(() => null)
    .then(config => {
      if (!config || !config.success) {
        config = {
          fields: {
            'BackgroundImage-0': { type: 'BackgroundImage' },
            'TextField-0': { type: 'TextField' },
          }
        }
      }
      Object.assign(config, {
        canvas: canvasObj
      })
      ReactDOM.render(e(Diplomas, config), domContainer)
    });
});