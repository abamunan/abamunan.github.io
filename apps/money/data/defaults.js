// Defaults copied verbatim from legacy mt.js (first-run / after Remove All Data).
export const DEFAULT_EXPENSE_FIELDS = [
  {id:'nasta',label:'Nasta',icon:'🍳',budget:0,pinned:true},
  {id:'lunch',label:'Lunch',icon:'🍛',budget:0,pinned:true},
  {id:'dinner',label:'Dinner',icon:'🍽️',budget:0,pinned:true},
  {id:'extrafood',label:'Extra Food',icon:'🥡',budget:0,pinned:false},
  {id:'transport',label:'Transportation',icon:'🚌',budget:0,pinned:true},
  {id:'extra',label:'Extra',icon:'➕',budget:0,pinned:false},
  {id:'unifee',label:'University Fee',icon:'🎓',budget:0,pinned:false},
  {id:'rent',label:'Home Rent',icon:'🏠',budget:0,pinned:false},
  {id:'mobile',label:'Mobile',icon:'📱',budget:0,pinned:false},
  {id:'stationary',label:'Stationery',icon:'📝',budget:0,pinned:false},

  {id:'bankdp',label:'Bank DP',icon:'🏦',budget:0,pinned:false},
  {id:'shopping',label:'Shopping',icon:'🛍️',budget:0,pinned:false},
  {id:'beauty',label:'Beauty',icon:'💄',budget:0,pinned:false},
  {id:'gadget',label:'Gadget',icon:'📟',budget:0,pinned:false},
  {id:'gift',label:'Gift',icon:'🎁',budget:0,pinned:false},
  {id:'social',label:'Social',icon:'👥',budget:0,pinned:false},
  {id:'tour',label:'Tour',icon:'🧳',budget:0,pinned:false},
  {id:'necessary',label:'Necessary',icon:'🧾',budget:0,pinned:true},
  {id:'medicine',label:'Medicine',icon:'💊',budget:0,pinned:false},
];
export const DEFAULT_INCOME_FIELDS = [
  {id:'family',label:'Family Income',icon:'👨‍👩‍👧',pinned:true},
  {id:'self',label:'Self Income',icon:'💼',pinned:true},
];
export const DEFAULT_ACCOUNTS = [
  {id:'cash',label:'Cash',icon:'💵',opening:0},
  {id:'bkash',label:'bKash',icon:'📱',opening:0},
  {id:'card',label:'Card',icon:'💳',opening:0},
];
export const DEFAULT_PINNED_EXPENSE_IDS=['nasta','lunch','dinner','transport','necessary'];
