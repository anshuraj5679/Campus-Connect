-- =====================================================================
-- 1. "Activity" class type for routine slots that are not lectures
--    (Library, Placement, Sports, IIC / Department Activity, Cultural…).
-- 2. BMSIT&M period timings, as printed on the department timetables:
--    I 8:30–9:25 · II 9:25–10:20 · Break 10:20–10:40 · III 10:40–11:35 ·
--    IV 11:35–12:30 · Lunch 12:30–1:25 · V 1:25–2:20 · VI 2:20–3:15 · VII 3:15–4:10
-- =====================================================================

alter type public.class_type add value if not exists 'ACTIVITY';

update public.period_slots p
   set label = v.label, start_time = v.start_time::time, end_time = v.end_time::time, period_no = v.period_no, is_break = v.is_break
  from (values
    (1, 1,    'I',     '08:30', '09:25', false),
    (2, 2,    'II',    '09:25', '10:20', false),
    (3, null, 'Break', '10:20', '10:40', true),
    (4, 3,    'III',   '10:40', '11:35', false),
    (5, 4,    'IV',    '11:35', '12:30', false),
    (6, null, 'Lunch', '12:30', '13:25', true),
    (7, 5,    'V',     '13:25', '14:20', false),
    (8, 6,    'VI',    '14:20', '15:15', false),
    (9, 7,    'VII',   '15:15', '16:10', false)
  ) as v(sort_order, period_no, label, start_time, end_time, is_break)
 where p.sort_order = v.sort_order;

update public.college_settings set college_start = '08:30', college_end = '16:10' where id = 1;
