-- Debts: drop interest maths and the internal/external split from the UI.
--
-- Fold any computed interest into the amount so the remaining balance users
-- see does not move, zero the interest fields, and merge internal debts into
-- external (one list now). Columns stay; no schema change.

update public.debts
   set principal = total_repayable
 where total_repayable > principal;

update public.debts
   set interest_rate = 0,
       interest_type = 'flat',
       loan_tenure_months = null,
       monthly_minimum = 0,
       total_repayable = principal
 where interest_rate <> 0
    or interest_type <> 'flat'
    or loan_tenure_months is not null
    or monthly_minimum <> 0
    or total_repayable <> principal;

update public.debts
   set type = 'external'
 where type = 'internal';
