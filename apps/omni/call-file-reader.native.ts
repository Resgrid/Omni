import { setCallFileReader } from '@resgrid/data';
import { File } from 'expo-file-system';

setCallFileReader((uri) => new File(uri).base64());
