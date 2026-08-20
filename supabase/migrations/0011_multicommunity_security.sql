-- Helper function to check if the user is a municipality administrator (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.check_is_municipality(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = user_uuid AND role = 'municipality'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Helper function to check if the user is a collector (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.check_is_collector(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = user_uuid AND role = 'collector'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Restructure public.users RLS to allow community matches and municipality oversight
DROP POLICY IF EXISTS "Users can read their own profiles" ON public.users;

CREATE POLICY "Users can read profiles based on role and community"
    ON public.users FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id OR
        public.check_is_municipality(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.community_memberships cm1
            JOIN public.community_memberships cm2 ON cm1.community_id = cm2.community_id
            WHERE cm1.user_id = auth.uid() AND cm2.user_id = public.users.id
        )
    );

-- Restructure public.collection_requests RLS for community-aware collector isolation
DROP POLICY IF EXISTS "Users can view collection requests based on role" ON public.collection_requests;

CREATE POLICY "Users can view collection requests based on role and community"
    ON public.collection_requests FOR SELECT
    TO authenticated
    USING (
        auth.uid() = resident_id OR
        public.check_is_municipality(auth.uid()) OR
        (
            public.check_is_collector(auth.uid()) AND
            EXISTS (
                SELECT 1 FROM public.community_memberships cm
                WHERE cm.user_id = auth.uid() AND cm.community_id = collection_requests.community_id
            )
        )
    );

DROP POLICY IF EXISTS "Users can update collection requests based on role" ON public.collection_requests;

CREATE POLICY "Users can update collection requests based on role and community"
    ON public.collection_requests FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = resident_id OR
        public.check_is_municipality(auth.uid()) OR
        (
            public.check_is_collector(auth.uid()) AND
            EXISTS (
                SELECT 1 FROM public.community_memberships cm
                WHERE cm.user_id = auth.uid() AND cm.community_id = collection_requests.community_id
            )
        )
    );
