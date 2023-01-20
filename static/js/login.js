'use strict';

const e = React.createElement;

function LoginScreen(props) {
  return e('div', { id: 'application_root' },
    e('div', { className: 'login_box' },
      e('h1', {}, 'Automatic tournament creation for Lichess'),
      e('button', {
        onClick: () => { window.location.href = '/login' }
      }, 'Login with Lichess')))
}

document.addEventListener('DOMContentLoaded', () => {
  const domContainer = document.querySelector('#app_root');
  ReactDOM.render(
    e(React.StrictMode, {}, e(LoginScreen, {})), domContainer)
});