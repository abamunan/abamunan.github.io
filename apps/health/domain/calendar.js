export const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const daysInMonth = (y, m0) => m0 === 1 && isLeap(y) ? 29 : DIM[m0];
