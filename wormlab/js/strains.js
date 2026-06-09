/**
 * strains.js — course access policy for strains.
 *
 * The full STRAINS catalog lives in LifeCycle.js. For the genetics-lab course we
 * only let STUDENTS *select* a small, curated set of strains for their plates.
 * Every other strain is still shown (so students can read about it) but is LOCKED
 * — it cannot be chosen as a worm. Teachers can use any strain.
 *
 * Edit STUDENT_STRAIN_IDS to change what students may inoculate.
 */
import { STRAINS } from './LifeCycle.js?v=9';

// The only strains a student may put on a plate.
export const STUDENT_STRAIN_IDS = ['N2', 'N2-male', 'dpy-11', 'dpy-11-male', 'dpy-13', 'dpy-13-male'];

export function isUnlockedForStudent(strainId) {
  return STUDENT_STRAIN_IDS.includes(strainId);
}

/**
 * Strain list for the dropdowns. Unlocked strains first (in STUDENT order), then
 * the locked ones. For a student build the locked entries are shown but disabled.
 * @param {boolean} isTeacher  teachers get everything unlocked
 */
export function strainOptions(isTeacher) {
  const all = Object.values(STRAINS).filter(s => s.id !== 'custom');
  const unlocked = STUDENT_STRAIN_IDS.map(id => STRAINS[id]).filter(Boolean);
  const locked = all.filter(s => !STUDENT_STRAIN_IDS.includes(s.id));
  return [...unlocked, ...locked].map(s => ({
    id: s.id,
    label: s.label,
    locked: isTeacher ? false : !STUDENT_STRAIN_IDS.includes(s.id),
  }));
}
