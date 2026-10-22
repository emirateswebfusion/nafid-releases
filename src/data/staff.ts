import { bindBridge } from './client';

/** Staff, PIN verification, staff ledger and attendance. Channel catalog — the only way UI code reaches these IPC channels. */
export const staffApi = bindBridge({
  getStaff: 'dbGetStaff',
  saveStaff: 'dbSaveStaff',
  verifyBillerPin: 'dbVerifyBillerPin',
  getStaffLedger: 'dbGetStaffLedger',
  addStaffTransaction: 'dbAddStaffTransaction',
  getStaffAttendance: 'dbGetStaffAttendance',
  saveStaffAttendance: 'dbSaveStaffAttendance',
});
