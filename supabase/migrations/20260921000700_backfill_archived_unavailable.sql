-- Properties archived before the archive rule existed still carried their old availability.
-- Align them with the rule that an archived property is unavailable. Nothing is deleted and
-- restoring a property still leaves availability for staff to confirm.
update public.properties
   set availability = 'unavailable'
 where (status = 'archived' or archived_at is not null)
   and availability is distinct from 'unavailable';
