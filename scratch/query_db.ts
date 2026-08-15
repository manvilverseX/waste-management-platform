import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

async function main() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log('Querying communities...');
  const { data: comms, error: commsErr } = await supabase.from('communities').select('*');
  console.log('Communities:', comms, commsErr);
}

main().catch(console.error);
