'use strict';

const e = React.createElement;

function DiplomaConfiguration(props) {
  const fields = {}
  const getType = type => ({
    'BackgroundImage': BackgroundImage,
    'ImageField': ImageField,
    'TextField': TextField
  }[type]);
  for (const fieldKey in props.fields) {
    fields[fieldKey] = Object.assign({}, props.fields[fieldKey].type.defaultProps, props.fields[fieldKey])
  }
  const [fieldsValues, setFieldsValues] = React.useState(fields);
  const handleChange = (fieldKey, newState) => {
    let newFields = Object.assign({}, fieldsValues);
    Object.assign(newFields[fieldKey], newState);
    setFieldsValues(newFields);
  };
  const handleRemove = (fieldKey) => {
    let newFields = Object.assign({}, fieldsValues);
    delete newFields[fieldKey];
    setFieldsValues(newFields);
  };

  const [addingField, setAddingField] = React.useState('BackgroundImage');
  const addField = () => {
    let newFields = Object.assign({}, fieldsValues);
    let i = 0;
    while (fieldsValues[`${addingField}-${i}`]) i++;
    newFields[`${addingField}-${i}`] = { type: addingField };
    setFieldsValues(newFields);
  }
  const children = [];
  for (const fieldKey in fieldsValues) {
    children.push(
      e(
        getType(fieldsValues[fieldKey].type),
        Object.assign(
          {},
          fieldsValues[fieldKey],
          {
            key: fieldKey,
            fieldKey: fieldKey,
            handleChange: handleChange,
            handleRemove: handleRemove
          })))
  };

  const [templateName, setTemplateName] = React.useState(props.name);

  const save = () => {
    // TODO: Error reporting
    fetch(`/api/v1/diploma/template/${diploma_template_id}?_xsrf=${xsrf}`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'appication/json'
      },
      body: JSON.stringify({
        name: templateName,
        thumbnail: canvasObj.toDataURL({
          format: 'png',
          multiplier: .2
        }),
        fields: fieldsValues,
      })
    })
  };
  return [
    e('label', { key: 'template-name-label', htmlFor: 'template_name' }, "Name: "),
    e('input', { key: 'template-name-input', id: 'template_name', type: 'text', value: templateName, placeholder: 'Diploma Template 1', onChange: (e) => setTemplateName(e.target.value) }),
    e('h3', { key: "diploma_config_header", className: "diploma_config_header" }, "Diploma fields"),
    e('select', { key: "diploma-add-selector", onChange: event => setAddingField(event.target.value) }, [
      e('option', { key: 'BackgroundImage', value: 'BackgroundImage' }, "Background Image"),
      e('option', { key: 'ImageField', value: 'ImageField' }, "Image"),
      e('option', { key: 'TextField', value: 'TextField' }, "Text"),
    ]),
    e('button', { key: "add_btn", onClick: addField }, "Add"),
    e('div', { key: "diploma_field_list", className: "diploma_field_list" }, children),
    e('button', { key: "save_btn", onClick: save }, "Save")
  ]
    ;
}

class BackgroundImage extends React.Component {
  static defaultProps = { image: null };

  constructor(props) {
    super(props);
  }

  renderOnCanvas() {
    if (!this.props.image)
      return;
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
    }
  }

  render() {
    this.renderOnCanvas();
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
  }

  shouldComponentUpdate(nextProps, nextState) {
    for (const k in nextProps) {
      if (k != 'fabric_props' && nextProps[k] != this.props[k])
        return true;
    }
    return false;
  }
  renderOnCanvas() {
    if (!this.props.image)
      return;
    const imgElement = document.createElement('img');
    imgElement.src = this.props.image;
    imgElement.onload = () => {
      if (!this.imageObject) {
        this.imageObject = new fabric.Image(imgElement,
          Object.assign({
            angle: 0,
            opacity: 1,
            left: 10,
            top: 10,
          }, this.props.fabric_props)
        )
        this.imageObject.setControlsVisibility({
          tl: true,
          tr: true,
          bl: true,
          br: true,
          mtr: true
        });
        this.imageObject.scaleToWidth(canvasObj.width * .7);
        canvasObj.add(this.imageObject);
        this.imageObject.on('modified',
          (event) => {
            this.props.handleChange(this.props.fieldKey, { fabric_props: this.imageObject.toJSON() })
          });
      } else {
        this.imageObject.setElement(imgElement);
        canvasObj.renderAll();
      }
      canvasObj.setActiveObject(this.imageObject);
    }
  }

  render() {
    this.renderOnCanvas();
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
  }

  shouldComponentUpdate(nextProps, nextState) {
    for (const k in nextProps) {
      if (k != 'fabric_props' && nextProps[k] != this.props[k])
        return true;
    }
    return false;
  }

  renderOnCanvas() {
    if (!this.textBox) {
      this.textBox = new fabric.Text(
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
      this.textBox.set('fill', this.props.color);
      this.textBox.setControlsVisibility({
        tl: true,
        tr: true,
        bl: true,
        br: true,
        mtr: true
      });
      canvasObj.add(this.textBox);
      this.textBox.on('modified',
        (event) => {
          this.props.handleChange(this.props.fieldKey, { fabric_props: this.textBox.toJSON() })
        });
    } else {
      this.textBox.text = this.props.text;
      this.textBox.fontFamily = this.props.font;
      this.textBox.fontSize = this.props.font_size;
      this.textBox.set('fill', this.props.color)
      canvasObj.renderAll();
    }
    canvasObj.setActiveObject(this.textBox);
  }

  render() {
    this.renderOnCanvas();
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

let canvasObj;
document.addEventListener('DOMContentLoaded', () => {
  const domContainer = document.querySelector('#diploma_fields');
  canvasObj = new fabric.Canvas(document.getElementById('diploma_canvas'));
  fetch(`/api/v1/diploma/template/${diploma_template_id}`, {
    credentials: 'include',
  })
    .then(res => res.json())
    .catch(() => null)
    .then(config => {
      if (!config || !config.success) {
        config = {
          fields: {
            'background-image': { type: 'BackgroundImage' },
            'player-name': { type: 'TextField' },
          }
        }
      }
      ReactDOM.render(e(DiplomaConfiguration, config), domContainer)
    });
});