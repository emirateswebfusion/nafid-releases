/** A tenant (shop) row as the super admin API lists it. */
export interface TenantAdmin {
  tenant_id: string;
  name: string;
  domain_type: string;
  db_connection_string: string;
  created_at: string;
  owner_email: string;
  neon_mail_id?: string;
  neon_password?: string;
}
