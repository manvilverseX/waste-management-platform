-- Revoke EXECUTE access from anon role for the membership checking function
REVOKE EXECUTE ON FUNCTION check_user_community_membership(UUID, UUID) FROM anon;
