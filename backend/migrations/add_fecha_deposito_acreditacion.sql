-- Agregar fecha_deposito y fecha_acreditacion a precheck_pagos
ALTER TABLE precheck_pagos ADD COLUMN fecha_deposito DATE NULL;
ALTER TABLE precheck_pagos ADD COLUMN fecha_acreditacion DATE NULL;

-- Backfill: copiar fecha_pago a los nuevos campos para pagos existentes
UPDATE precheck_pagos SET fecha_deposito = fecha_pago WHERE fecha_deposito IS NULL;
UPDATE precheck_pagos SET fecha_acreditacion = fecha_pago WHERE fecha_acreditacion IS NULL;
