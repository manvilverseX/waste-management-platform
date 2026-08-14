-- Drop the recursive select policy
DROP POLICY IF EXISTS "Users can view memberships of their own communities" ON community_memberships;

-- Create a security definer function to safely check membership without RLS recursion
CREATE OR REPLACE FUNCTION check_user_community_membership(user_uuid UUID, community_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.community_memberships
        WHERE user_id = user_uuid AND community_id = community_uuid
    );
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp;

-- Revoke default PUBLIC execution
REVOKE EXECUTE ON FUNCTION check_user_community_membership(UUID, UUID) FROM PUBLIC;

-- Grant EXECUTE only to authenticated and service_role
GRANT EXECUTE ON FUNCTION check_user_community_membership(UUID, UUID) TO authenticated, service_role;

-- Re-create the policy using the security definer function
CREATE POLICY "Users can view memberships of their own communities"
    ON public.community_memberships FOR SELECT
    USING (
        auth.uid() = user_id OR 
        check_user_community_membership(auth.uid(), community_id)
    );
