-- 1. Nova coluna step_deadline em pipeline_items
ALTER TABLE pipeline_items ADD COLUMN step_deadline timestamptz;

-- 2. Função auxiliar add_business_days
DROP FUNCTION IF EXISTS add_business_days(timestamptz, int);
CREATE OR REPLACE FUNCTION add_business_days(start_ts timestamptz, days int)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result timestamptz := start_ts;
  remaining int := days;
  dow int;
BEGIN
  WHILE remaining > 0 LOOP
    result := result + INTERVAL '1 day';
    dow := EXTRACT(DOW FROM result); -- 0=Sun, 6=Sat
    IF dow <> 0 AND dow <> 6 THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- 3. Linha de configuração em sla_config (prazo inicial de 3 dias úteis)
INSERT INTO sla_config (pipeline_subtype, business_days)
VALUES ('laudo_enviado_radiologista', 3)
ON CONFLICT (pipeline_subtype) DO NOTHING;

-- 4. Função do trigger
CREATE OR REPLACE FUNCTION set_step_deadline_on_enviado_radiologista()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_business_days int;
BEGIN
  IF NEW.status = 'enviado_radiologista' AND OLD.status <> 'enviado_radiologista' THEN
    SELECT business_days INTO v_business_days
    FROM sla_config
    WHERE pipeline_subtype = 'laudo_enviado_radiologista';

    IF v_business_days IS NOT NULL THEN
      NEW.step_deadline := add_business_days(NEW.opened_at, v_business_days);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Trigger
CREATE TRIGGER pipeline_items_step_deadline
BEFORE UPDATE ON pipeline_items
FOR EACH ROW
EXECUTE FUNCTION set_step_deadline_on_enviado_radiologista();
