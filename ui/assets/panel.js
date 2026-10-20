import { hana } from './sdk.js';
import { appUi, appUiIcon, mountAppUi } from './app-ui.js';

let name = '';
const greeting = document.getElementById('greeting');

const onNameChange = (event) => { name = event.target.value; renderForm(); };
const onGreet = () => { greeting.textContent = 'Hello, ' + (name || 'world') + '!'; };
const onReset = () => { name = ''; renderForm(); };

function renderForm() {
  form.update({
    label: 'Name',
    hint: 'Rendered with the official App UI controls.',
    control: appUi('Inline', {
      gap: 'sm',
      children: [
        appUi('TextInput', { 'aria-label': 'Name', placeholder: 'Your name', value: name, onChange: onNameChange }),
        appUi('Tooltip', { content: 'Greet the user', children: appUi('IconButton', { label: 'Greet', children: appUiIcon('chevron'), onClick: onGreet }) }),
        appUi('DropdownMenu', { items: [{ id: 'reset', label: 'Reset', action: onReset }], children: appUi('Button', { size: 'sm', children: 'More' }) }),
      ],
    }),
  });
}

const form = mountAppUi(document.getElementById('form'), 'SettingsRow', { label: 'Name', control: null });
renderForm();

hana.ready();
document.getElementById('startup-status').textContent = 'App ready. Replace this panel with your interface.';
