import { AppRegistry } from 'react-native';
import { Buffer } from 'buffer';

import App from './App';

global.Buffer = global.Buffer || Buffer;

AppRegistry.registerComponent('main', () => App);
