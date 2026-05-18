// ─── MEMBERS ─────────────────────────────────────────────────────────────────
export const MEMBERS = [
  { id:1, name:'Rohan Sharma',    age:28, weight:78, height:175, contact:'+91 98765 43210', email:'rohan@email.com',   goal:'Weight Loss',  plan:'Premium',  planPrice:2999, join:'Jan 15, 2024', expiry:'Jun 15, 2025', trainer:'Amit Kumar',  status:'Active',  checkins:142, avatar:'RS', paid:true,  bf:22, strength:70 },
  { id:2, name:'Priya Mehta',     age:24, weight:58, height:162, contact:'+91 87654 32109', email:'priya@email.com',   goal:'Muscle Gain',  plan:'Standard', planPrice:1499, join:'Mar 10, 2024', expiry:'May 20, 2025', trainer:'Neha Singh',  status:'Active',  checkins:98,  avatar:'PM', paid:true,  bf:28, strength:55 },
  { id:3, name:'Aarav Joshi',     age:32, weight:85, height:180, contact:'+91 76543 21098', email:'aarav@email.com',   goal:'Strength',     plan:'Premium',  planPrice:2999, join:'Feb 20, 2023', expiry:'Feb 20, 2026', trainer:'Amit Kumar',  status:'Active',  checkins:318, avatar:'AJ', paid:true,  bf:18, strength:88 },
  { id:4, name:'Sneha Gupta',     age:27, weight:62, height:158, contact:'+91 65432 10987', email:'sneha@email.com',   goal:'Flexibility',  plan:'Standard', planPrice:1499, join:'Apr 01, 2024', expiry:'Apr 01, 2025', trainer:'Neha Singh',  status:'Expired', checkins:45,  avatar:'SG', paid:false, bf:30, strength:42 },
  { id:5, name:'Karan Verma',     age:22, weight:70, height:172, contact:'+91 54321 09876', email:'karan@email.com',   goal:'Weight Loss',  plan:'Trial',    planPrice:499,  join:'May 01, 2025', expiry:'May 31, 2025', trainer:'Amit Kumar',  status:'Trial',   checkins:3,   avatar:'KV', paid:true,  bf:25, strength:48 },
  { id:6, name:'Anjali Singh',    age:29, weight:55, height:160, contact:'+91 43210 98765', email:'anjali@email.com',  goal:'Toning',       plan:'Premium',  planPrice:2999, join:'Dec 01, 2023', expiry:'Dec 01, 2025', trainer:'Neha Singh',  status:'Active',  checkins:203, avatar:'AS', paid:true,  bf:24, strength:60 },
  { id:7, name:'Vikram Patel',    age:35, weight:90, height:182, contact:'+91 32109 87654', email:'vikram@email.com',  goal:'Strength',     plan:'Standard', planPrice:1499, join:'Jun 01, 2024', expiry:'Jun 01, 2025', trainer:'Raj Sharma',  status:'Active',  checkins:67,  avatar:'VP', paid:false, bf:20, strength:80 },
  { id:8, name:'Nisha Rao',       age:26, weight:52, height:155, contact:'+91 21098 76543', email:'nisha@email.com',   goal:'Weight Loss',  plan:'Standard', planPrice:1499, join:'Aug 15, 2024', expiry:'Aug 15, 2025', trainer:'Neha Singh',  status:'Active',  checkins:54,  avatar:'NR', paid:true,  bf:27, strength:45 },
  { id:9, name:'Arjun Kapoor',    age:30, weight:82, height:178, contact:'+91 10987 65432', email:'arjun@email.com',   goal:'Muscle Gain',  plan:'Premium',  planPrice:2999, join:'Nov 10, 2023', expiry:'Nov 10, 2025', trainer:'Raj Sharma',  status:'Active',  checkins:190, avatar:'AK', paid:true,  bf:17, strength:85 },
  { id:10, name:'Meera Nair',     age:23, weight:50, height:152, contact:'+91 09876 54321', email:'meera@email.com',   goal:'Flexibility',  plan:'Standard', planPrice:1499, join:'Feb 01, 2025', expiry:'Feb 01, 2026', trainer:'Divya Patel', status:'Active',  checkins:28,  avatar:'MN', paid:true,  bf:22, strength:38 },
]

// ─── TRAINERS ─────────────────────────────────────────────────────────────────
export const TRAINERS = [
  { id:1, name:'Amit Kumar',  spec:'Strength & Conditioning', exp:8,  email:'amit@ironpulse.app', contact:'+91 99887 76655', clients:3, rating:4.8, avatar:'AK', days:['Mon','Wed','Fri','Sat'], salary:45000, bio:'8 years of professional training. Certified NSCA strength coach. Specialist in powerlifting and athletic performance.' },
  { id:2, name:'Neha Singh',  spec:'Yoga & Flexibility',      exp:5,  email:'neha@ironpulse.app', contact:'+91 88776 65544', clients:4, rating:4.9, avatar:'NS', days:['Tue','Thu','Sat','Sun'], salary:38000, bio:'Certified yoga instructor and flexibility specialist. Trained in Hatha and Vinyasa yoga.' },
  { id:3, name:'Raj Sharma',  spec:'CrossFit & HIIT',         exp:6,  email:'raj@ironpulse.app',  contact:'+91 77665 54433', clients:2, rating:4.7, avatar:'RS', days:['Mon','Tue','Thu','Fri'], salary:42000, bio:'CrossFit Level 2 Trainer. Expert in metabolic conditioning, HIIT, and functional fitness.' },
  { id:4, name:'Divya Patel', spec:'Nutrition & Weight Loss', exp:4,  email:'divya@ironpulse.app',contact:'+91 66554 43322', clients:1, rating:4.6, avatar:'DP', days:['Mon','Wed','Fri'],        salary:35000, bio:'Certified nutritionist with 4 years experience. Specializes in sustainable weight loss and body recomposition.' },
]

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
export const PAYMENTS = [
  { id:1,  member:'Rohan Sharma',  amount:2999, plan:'Premium',  date:'May 01, 2025', status:'Paid',    method:'UPI',  invoice:'INV-2025-001' },
  { id:2,  member:'Priya Mehta',   amount:1499, plan:'Standard', date:'May 03, 2025', status:'Paid',    method:'Card', invoice:'INV-2025-002' },
  { id:3,  member:'Aarav Joshi',   amount:2999, plan:'Premium',  date:'May 01, 2025', status:'Paid',    method:'Cash', invoice:'INV-2025-003' },
  { id:4,  member:'Sneha Gupta',   amount:1499, plan:'Standard', date:'Apr 30, 2025', status:'Overdue', method:'—',    invoice:'INV-2025-004' },
  { id:5,  member:'Vikram Patel',  amount:1499, plan:'Standard', date:'May 05, 2025', status:'Pending', method:'—',    invoice:'INV-2025-005' },
  { id:6,  member:'Anjali Singh',  amount:2999, plan:'Premium',  date:'May 02, 2025', status:'Paid',    method:'UPI',  invoice:'INV-2025-006' },
  { id:7,  member:'Nisha Rao',     amount:1499, plan:'Standard', date:'May 08, 2025', status:'Paid',    method:'Card', invoice:'INV-2025-007' },
  { id:8,  member:'Arjun Kapoor',  amount:2999, plan:'Premium',  date:'May 01, 2025', status:'Paid',    method:'UPI',  invoice:'INV-2025-008' },
  { id:9,  member:'Karan Verma',   amount:499,  plan:'Trial',    date:'May 01, 2025', status:'Paid',    method:'UPI',  invoice:'INV-2025-009' },
  { id:10, member:'Meera Nair',    amount:1499, plan:'Standard', date:'May 06, 2025', status:'Paid',    method:'Cash', invoice:'INV-2025-010' },
]

// ─── WORKOUTS ─────────────────────────────────────────────────────────────────
export const WORKOUTS = [
  {
    id:1, name:'Full Body Beginner', member:'Karan Verma', trainer:'Amit Kumar',
    days:3, goal:'Weight Loss', duration:'45 min', level:'Beginner',
    exercises:[
      { name:'Bodyweight Squats',  sets:3, reps:'12', rest:'60s', muscle:'Legs'  },
      { name:'Push-ups',           sets:3, reps:'10', rest:'60s', muscle:'Chest' },
      { name:'Plank Hold',         sets:3, reps:'30s',rest:'45s', muscle:'Core'  },
      { name:'Reverse Lunges',     sets:3, reps:'10', rest:'60s', muscle:'Legs'  },
      { name:'Dumbbell Row',       sets:3, reps:'12', rest:'60s', muscle:'Back'  },
      { name:'Glute Bridge',       sets:3, reps:'15', rest:'45s', muscle:'Glutes'},
      { name:'Mountain Climbers',  sets:3, reps:'20', rest:'45s', muscle:'Core'  },
      { name:'Tricep Dips',        sets:3, reps:'10', rest:'60s', muscle:'Arms'  },
    ]
  },
  {
    id:2, name:'Strength Building', member:'Rohan Sharma', trainer:'Amit Kumar',
    days:5, goal:'Strength', duration:'75 min', level:'Intermediate',
    exercises:[
      { name:'Barbell Bench Press',sets:4, reps:'8',  rest:'90s', muscle:'Chest'     },
      { name:'Deadlift',           sets:4, reps:'6',  rest:'120s',muscle:'Back/Legs' },
      { name:'Barbell Back Squat', sets:4, reps:'8',  rest:'120s',muscle:'Legs'      },
      { name:'Overhead Press',     sets:3, reps:'8',  rest:'90s', muscle:'Shoulders' },
      { name:'Weighted Pull-ups',  sets:3, reps:'8',  rest:'90s', muscle:'Back'      },
      { name:'Barbell Row',        sets:4, reps:'8',  rest:'90s', muscle:'Back'      },
      { name:'Romanian Deadlift',  sets:3, reps:'10', rest:'90s', muscle:'Hamstrings'},
      { name:'Face Pulls',         sets:3, reps:'15', rest:'60s', muscle:'Shoulders' },
    ]
  },
  {
    id:3, name:'Yoga Flow', member:'Priya Mehta', trainer:'Neha Singh',
    days:4, goal:'Flexibility', duration:'60 min', level:'Beginner',
    exercises:[
      { name:'Sun Salutation (A)', sets:3, reps:'5 rounds', rest:'30s', muscle:'Full Body' },
      { name:'Warrior I Pose',     sets:1, reps:'60s/side', rest:'30s', muscle:'Legs/Hips' },
      { name:'Warrior II Pose',    sets:1, reps:'60s/side', rest:'30s', muscle:'Legs/Hips' },
      { name:'Triangle Pose',      sets:1, reps:'45s/side', rest:'30s', muscle:'Core/Hips' },
      { name:'Pigeon Pose',        sets:1, reps:'90s/side', rest:'0s',  muscle:'Hips'      },
      { name:"Child's Pose",       sets:1, reps:'90s',      rest:'0s',  muscle:'Back'      },
    ]
  },
  {
    id:4, name:'HIIT Cardio Blast', member:'Anjali Singh', trainer:'Raj Sharma',
    days:4, goal:'Toning', duration:'40 min', level:'Intermediate',
    exercises:[
      { name:'Burpees',            sets:4, reps:'10', rest:'30s', muscle:'Full Body' },
      { name:'Jump Squats',        sets:4, reps:'15', rest:'30s', muscle:'Legs'      },
      { name:'High Knees',         sets:4, reps:'30s',rest:'30s', muscle:'Cardio'    },
      { name:'Box Jumps',          sets:3, reps:'10', rest:'45s', muscle:'Legs'      },
      { name:'Battle Ropes',       sets:3, reps:'30s',rest:'30s', muscle:'Arms/Core' },
      { name:'Sprint Intervals',   sets:6, reps:'20s',rest:'40s', muscle:'Cardio'    },
    ]
  },
]

// ─── DIET PLANS ───────────────────────────────────────────────────────────────
export const DIET_PLANS = [
  {
    id:1, name:'Weight Loss Diet', member:'Rohan Sharma',
    calories:1800, protein:140, carbs:180, fat:60,
    meals:[
      { time:'7:00 AM',  name:'Breakfast',    items:'Oats (80g) + 2 boiled eggs + 1 banana + green tea' },
      { time:'10:00 AM', name:'Mid Morning',  items:'10 almonds + 1 apple' },
      { time:'1:00 PM',  name:'Lunch',        items:'Brown rice (100g) + dal (1 cup) + grilled chicken (150g) + salad' },
      { time:'4:00 PM',  name:'Pre-Workout',  items:'Whey protein shake (30g) + 1 banana' },
      { time:'6:00 PM',  name:'Post-Workout', items:'Whey protein shake (25g) + rice cakes' },
      { time:'8:30 PM',  name:'Dinner',       items:'2 whole wheat rotis + paneer sabzi (100g) + curd (1 cup)' },
    ]
  },
  {
    id:2, name:'Muscle Gain Diet', member:'Aarav Joshi',
    calories:3200, protein:200, carbs:380, fat:80,
    meals:[
      { time:'7:00 AM',  name:'Breakfast',    items:'6 whole eggs + oats (150g) + banana smoothie + milk (500ml)' },
      { time:'10:00 AM', name:'Snack',        items:'Peanut butter toast (2 slices) + milk (300ml)' },
      { time:'1:00 PM',  name:'Lunch',        items:'White rice (200g) + chicken breast (250g) + mixed veggies + dal' },
      { time:'4:00 PM',  name:'Pre-Workout',  items:'Mass gainer shake (2 scoops) + banana' },
      { time:'7:00 PM',  name:'Post-Workout', items:'Whey protein (40g) + dextrose (50g) + banana' },
      { time:'9:30 PM',  name:'Dinner',       items:'3 rotis + dal makhani + paneer (150g) + curd' },
    ]
  },
  {
    id:3, name:'Balanced Toning Diet', member:'Anjali Singh',
    calories:2000, protein:120, carbs:250, fat:65,
    meals:[
      { time:'7:30 AM',  name:'Breakfast',    items:'2 eggs + 2 brown bread toast + 1 orange + black coffee' },
      { time:'10:30 AM', name:'Snack',        items:'Greek yogurt (150g) + mixed berries' },
      { time:'1:30 PM',  name:'Lunch',        items:'Quinoa (100g) + grilled paneer (100g) + roasted veggies' },
      { time:'4:30 PM',  name:'Pre-Workout',  items:'Protein bar + green tea' },
      { time:'8:00 PM',  name:'Dinner',       items:'Dal soup + 2 rotis + sautéed spinach' },
    ]
  },
]

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export const NOTIFICATIONS = [
  { id:1, type:'expiry',  title:'Membership Expired',   msg:"Sneha Gupta's membership expired 46 days ago. Send renewal reminder.",     time:'2h ago',  read:false },
  { id:2, type:'payment', title:'Payment Overdue',      msg:"Vikram Patel's payment of ₹1,499 is overdue. Follow up required.",         time:'4h ago',  read:false },
  { id:3, type:'checkin', title:'Peak Attendance',      msg:'84 members checked in today — highest this week! Great retention.',        time:'6h ago',  read:true  },
  { id:4, type:'new',     title:'New Member Joined',    msg:'Karan Verma registered on Trial plan. Assign a trainer.',                  time:'8h ago',  read:false },
  { id:5, type:'system',  title:'Report Ready',         msg:'Monthly revenue report for May 2025 is ready to download.',                time:'1d ago',  read:true  },
  { id:6, type:'expiry',  title:'Expiring in 7 Days',   msg:"Priya Mehta's membership expires on May 20. Send auto-reminder.",         time:'1d ago',  read:false },
  { id:7, type:'workout', title:'Workout Plan Updated',  msg:'Amit Kumar updated Rohan Sharma\'s strength program for Week 6.',         time:'2d ago',  read:true  },
  { id:8, type:'payment', title:'Payment Received',     msg:'₹2,999 received from Arjun Kapoor via UPI. Invoice INV-2025-008 issued.', time:'3d ago',  read:true  },
]

// ─── CHART DATA ───────────────────────────────────────────────────────────────
export const REV_DATA = [
  { month:'Jan', revenue:145000, expenses:45000, profit:100000 },
  { month:'Feb', revenue:158000, expenses:48000, profit:110000 },
  { month:'Mar', revenue:162000, expenses:46000, profit:116000 },
  { month:'Apr', revenue:175000, expenses:50000, profit:125000 },
  { month:'May', revenue:182000, expenses:52000, profit:130000 },
  { month:'Jun', revenue:168000, expenses:49000, profit:119000 },
]

export const ATT_DATA = [
  { day:'Mon', checkins:38 }, { day:'Tue', checkins:52 }, { day:'Wed', checkins:46 },
  { day:'Thu', checkins:68 }, { day:'Fri', checkins:59 }, { day:'Sat', checkins:84 },
  { day:'Sun', checkins:25 },
]

export const GROWTH_DATA = [
  { month:'Jan', new:18, left:5  }, { month:'Feb', new:22, left:8  },
  { month:'Mar', new:25, left:4  }, { month:'Apr', new:19, left:6  },
  { month:'May', new:28, left:3  },
]

export const PLAN_DATA = [
  { name:'Premium',  value:89,  color:'#e8420a' },
  { name:'Standard', value:124, color:'#00c8b4' },
  { name:'Trial',    value:34,  color:'#f59e0b' },
]

export const PROGRESS_DATA = [
  { week:'W1', weight:85,   fat:22,   strength:60 },
  { week:'W2', weight:84.2, fat:21.5, strength:65 },
  { week:'W3', weight:83.5, fat:21.0, strength:68 },
  { week:'W4', weight:82.8, fat:20.5, strength:72 },
  { week:'W5', weight:82.0, fat:20.0, strength:75 },
  { week:'W6', weight:81.5, fat:19.5, strength:78 },
]

export const CHECKIN_LOG = [
  { id:1, name:'Rohan Sharma',  time:'06:12 AM', out:'07:48 AM', avatar:'RS' },
  { id:2, name:'Aarav Joshi',   time:'06:45 AM', out:'08:30 AM', avatar:'AJ' },
  { id:3, name:'Anjali Singh',  time:'07:00 AM', out:'08:15 AM', avatar:'AS' },
  { id:4, name:'Vikram Patel',  time:'07:30 AM', out:'09:00 AM', avatar:'VP' },
  { id:5, name:'Arjun Kapoor',  time:'08:00 AM', out:'09:45 AM', avatar:'AK' },
  { id:6, name:'Priya Mehta',   time:'09:00 AM', out:'10:30 AM', avatar:'PM' },
  { id:7, name:'Meera Nair',    time:'09:30 AM', out:'11:00 AM', avatar:'MN' },
  { id:8, name:'Nisha Rao',     time:'10:00 AM', out:'11:30 AM', avatar:'NR' },
]

export const PLANS_CONFIG = [
  { name:'Trial',    price:499,  duration:'1 Month',   color:'#f59e0b', features:['Access to gym floor','1 trainer session','Basic diet advice'] },
  { name:'Standard', price:1499, duration:'1 Month',   color:'#00c8b4', features:['Full gym access','2 trainer sessions/week','Diet plan','Progress tracking'] },
  { name:'Premium',  price:2999, duration:'1 Month',   color:'#e8420a', features:['Full gym access','Unlimited trainer sessions','Custom diet plan','Progress tracking','Priority QR check-in','Locker access'] },
  { name:'Quarterly',price:3999, duration:'3 Months',  color:'#a855f7', features:['Standard plan benefits','3-month commitment discount','Nutrition workshop access'] },
  { name:'Annual',   price:12999,duration:'12 Months', color:'#22c55e', features:['Full gym access','All Premium benefits','Annual health assessment','Free merchandise','Priority booking'] },
]