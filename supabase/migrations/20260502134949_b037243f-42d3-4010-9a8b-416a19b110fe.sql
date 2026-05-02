CREATE OR REPLACE FUNCTION public.compute_multiplier_for_barrier(p_barriers integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  b numeric := GREATEST(0, COALESCE(p_barriers, 0));
  anchors numeric[][] := ARRAY[
    ARRAY[0::numeric, 0::numeric],
    ARRAY[7::numeric, 0::numeric],
    ARRAY[17::numeric, 0.5::numeric],
    ARRAY[27::numeric, 0.8::numeric],
    ARRAY[37::numeric, 1.0::numeric],
    ARRAY[47::numeric, 1.2::numeric],
    ARRAY[57::numeric, 1.5::numeric],
    ARRAY[67::numeric, 2.0::numeric],
    ARRAY[77::numeric, 3.0::numeric],
    ARRAY[87::numeric, 5.0::numeric],
    ARRAY[97::numeric, 10.0::numeric],
    ARRAY[100::numeric, 20.0::numeric],
    -- Cauda Fase 2 (pós-alvo) — escala estendida
    ARRAY[110::numeric, 26.0::numeric],
    ARRAY[127::numeric, 32.0::numeric],
    ARRAY[150::numeric, 40.0::numeric],
    ARRAY[200::numeric, 50.0::numeric]
  ];
  hard_cap numeric := 50.0;
  i int;
  x0 numeric; y0 numeric; x1 numeric; y1 numeric;
  t numeric; y numeric;
BEGIN
  IF b <= 0 THEN
    RETURN 0;
  END IF;
  IF b >= anchors[array_length(anchors, 1)][1] THEN
    RETURN hard_cap;
  END IF;
  FOR i IN 1..(array_length(anchors, 1) - 1) LOOP
    x0 := anchors[i][1];
    y0 := anchors[i][2];
    x1 := anchors[i+1][1];
    y1 := anchors[i+1][2];
    IF b >= x0 AND b <= x1 THEN
      IF x1 = x0 THEN
        RETURN LEAST(hard_cap, y1);
      END IF;
      t := (b - x0) / (x1 - x0);
      y := y0 + (y1 - y0) * t;
      RETURN LEAST(hard_cap, GREATEST(0, ROUND(y * 100) / 100));
    END IF;
  END LOOP;
  RETURN 0;
END;
$function$;