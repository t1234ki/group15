-- No demo laundry businesses are inserted. Marketplace listings come only from
-- real vendor registrations that have been approved by a platform admin.
-- Reset customer-operational data without deleting Supabase Auth users.
truncate table laundry.order_reschedules, laundry.order_events, laundry.order_addresses, laundry.order_items,
               laundry.reviews, laundry.orders, laundry.memberships,
               laundry.cart_items, laundry.carts,
               laundry.slots, laundry.catalog_items, laundry.catalog_categories,
               laundry.partner_tags, laundry.partner_hours, laundry.partner_service_areas,
               laundry.partner_holiday_closures, laundry.partner_capacity_overrides,
               laundry.partners,
               laundry.pincode_centroids restart identity;
