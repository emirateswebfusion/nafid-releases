import { parentPort, workerData } from 'node:worker_threads';
import { launchWindowsUpdate, type DownloadedWindowsInstaller } from './windowsUpdateInstaller.js';

const installer = workerData as DownloadedWindowsInstaller;
void launchWindowsUpdate(installer, phase => parentPort?.postMessage({ phase })).then(result => {
  parentPort?.postMessage({ result });
  parentPort?.close();
});
