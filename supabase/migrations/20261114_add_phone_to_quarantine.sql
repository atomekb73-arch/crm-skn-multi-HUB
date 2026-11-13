-- Dodanie kolumny phone do tabeli quarantine_submissions (jeśli jeszcze nie istnieje)
-- Umożliwia bezpośrednie i ustrukturyzowane przechowywanie numeru telefonu kandydata (np. SKN Uzależnienia)

ALTER TABLE public.quarantine_submissions 
ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.quarantine_submissions.phone IS 'Numer telefonu kandydata wprowadzony w formularzu zgłoszeniowym (np. SKN Uzależnienia)';
