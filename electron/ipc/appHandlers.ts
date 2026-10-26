import { app, ipcMain } from 'electron';
import os from 'node:os';
import { execSync } from 'node:child_process';
import dns from 'node:dns';
import log from 'electron-log/main';

export function registerAppHandlers(): void {
ipcMain.handle('app:getLocalIp', () => {
  try {
    const interfaces = os.networkInterfaces();
    const virtualPatterns = [/vEthernet/i, /wsl/i, /hyper-v/i, /virtualbox/i, /vmware/i, /bluetooth/i, /zerotier/i, /tailscale/i, /docker/i, /loopback/i, /npcap/i, /vbox/i];
    const physicalPatterns = [/wi-fi/i, /wifi/i, /wireless/i, /wlan/i, /ethernet/i, /eth/i, /lan/i, /local area connection/i];

    const candidates: { address: string; score: number }[] = [];

    for (const name of Object.keys(interfaces)) {
      const isVirtual = virtualPatterns.some(pat => pat.test(name));
      const isPhysical = physicalPatterns.some(pat => pat.test(name));

      for (const iface of interfaces[name] || []) {
        if ((iface.family === 'IPv4' || (iface as any).family === 4) && !iface.internal) {
          const ip = iface.address;
          if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

          let score = 50;
          if (isVirtual) {
            score = 10;
          } else {
            if (isPhysical) score += 30;
            if (ip.startsWith('192.168.')) score += 20;
            else if (ip.startsWith('10.')) score += 15;
            else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) score += 10;
          }
          candidates.push({ address: ip, score });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].address;
    }
  } catch (e) {
    console.error('[app:getLocalIp] Failed to detect IP address', e);
  }
  return process.env.DEFAULT_LAN_IP || '';
});

ipcMain.handle('app:getNetworkDetails', () => {
  try {
    const interfaces = os.networkInterfaces();
    const virtualPatterns = [/vEthernet/i, /wsl/i, /hyper-v/i, /virtualbox/i, /vmware/i, /bluetooth/i, /zerotier/i, /tailscale/i, /docker/i, /loopback/i, /npcap/i, /vbox/i];
    const physicalPatterns = [/wi-fi/i, /wifi/i, /wireless/i, /wlan/i, /ethernet/i, /eth/i, /lan/i, /local area connection/i];

    const candidates: { address: string; netmask: string; cidr?: string; score: number }[] = [];

    for (const name of Object.keys(interfaces)) {
      const isVirtual = virtualPatterns.some(pat => pat.test(name));
      const isPhysical = physicalPatterns.some(pat => pat.test(name));

      for (const iface of interfaces[name] || []) {
        if ((iface.family === 'IPv4' || (iface as any).family === 4) && !iface.internal) {
          const ip = iface.address;
          if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

          let score = 50;
          if (isVirtual) {
            score = 10;
          } else {
            if (isPhysical) score += 30;
            if (ip.startsWith('192.168.')) score += 20;
            else if (ip.startsWith('10.')) score += 15;
            else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) score += 10;
          }
          candidates.push({ address: ip, netmask: iface.netmask, cidr: iface.cidr || undefined, score });
        }
      }
    }

    let ip = '192.168.1.100';
    let netmask = '255.255.255.0';
    let subnetPrefix = '24';

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      ip = best.address;
      netmask = best.netmask || '255.255.255.0';
      if (best.cidr && best.cidr.includes('/')) {
        subnetPrefix = best.cidr.split('/')[1];
      } else if (netmask) {
        try {
          subnetPrefix = netmask.split('.').reduce((c, octet) => c + (parseInt(octet, 10).toString(2).match(/1/g) || []).length, 0).toString();
        } catch {
          subnetPrefix = '24';
        }
      }
    }

    let gateway = ip.replace(/\.\d+$/, '.1');
    try {
      if (process.platform === 'win32') {
        const gwOut = execSync('powershell -NoProfile -Command "(Get-NetRoute -DestinationPrefix \'0.0.0.0/0\' | Select-Object -First 1).NextHop"', { timeout: 2000, encoding: 'utf-8' }).trim();
        if (gwOut && /^(\d{1,3}\.){3}\d{1,3}$/.test(gwOut)) {
          gateway = gwOut;
        }
      }
    } catch (_) { /* ignore */ }

    let dnsAddress = '8.8.8.8';
    try {
      const servers = dns.getServers();
      const validDns = servers.find(s => s && s !== '127.0.0.1' && s !== '::1' && !s.startsWith('127.'));
      if (validDns) {
        dnsAddress = validDns;
      }
    } catch (_) { /* ignore */ }

    return {
      ip,
      subnetPrefix,
      netmask,
      gateway,
      dns: dnsAddress
    };
  } catch (e) {
    console.error('[app:getNetworkDetails] Failed to detect network details', e);
    return {
      ip: process.env.DEFAULT_LAN_IP || '',
      subnetPrefix: '24',
      netmask: '255.255.255.0',
      gateway: process.env.DEFAULT_GATEWAY || '',
      dns: process.env.DEFAULT_DNS || ''
    };
  }
});


ipcMain.handle('log:error', (event, payload: { message: string, error?: any }) => {
  log.error('[Frontend Error]', payload.message, payload.error || '');
});

ipcMain.removeHandler('app:getVersion');
ipcMain.handle('app:getVersion', () => app.getVersion());


}
