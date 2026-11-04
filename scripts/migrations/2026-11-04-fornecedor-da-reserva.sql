-- Fornecedor e forma de pagamento de cada reserva de hotel (04/11). Também roda no boot.
ALTER TABLE hotel_room_groups ADD COLUMN IF NOT EXISTS fornecedor text;
ALTER TABLE hotel_room_groups ADD COLUMN IF NOT EXISTS forma_pagamento text;
