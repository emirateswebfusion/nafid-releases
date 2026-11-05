import { parentPort, workerData } from 'node:worker_threads';
import { launchWindowsUpdate, type DownloadedWindowsInstaller } from './windowsUpdateInstaller.js';

const installer = workerData as DownloadedWindowsInstaller;
void launchWindowsUpdate(installer, (phase, percent) => parentPort?.postMessage({ phase, percent })).then(result => {
  parentPort?.postMessage({ result });
  parentPort?.close();
});
