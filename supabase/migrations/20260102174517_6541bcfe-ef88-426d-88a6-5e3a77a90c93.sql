-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vaults (folders) table
CREATE TABLE public.vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create publications table
CREATE TABLE public.publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES public.vaults(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  authors TEXT[] DEFAULT '{}',
  year INTEGER,
  journal TEXT,
  volume TEXT,
  issue TEXT,
  pages TEXT,
  doi TEXT,
  url TEXT,
  abstract TEXT,
  pdf_url TEXT,
  bibtex_key TEXT,
  publication_type TEXT DEFAULT 'article',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tags table
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create publication_tags junction table
CREATE TABLE public.publication_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  UNIQUE(publication_id, tag_id)
);

-- Create vault_shares table for sharing vaults
CREATE TABLE public.vault_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  shared_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT DEFAULT 'read',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_shares ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Vaults policies
CREATE POLICY "Users can view own vaults" ON public.vaults FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vaults" ON public.vaults FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vaults" ON public.vaults FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own vaults" ON public.vaults FOR DELETE USING (auth.uid() = user_id);

-- Publications policies
CREATE POLICY "Users can view own publications" ON public.publications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own publications" ON public.publications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own publications" ON public.publications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own publications" ON public.publications FOR DELETE USING (auth.uid() = user_id);

-- Tags policies
CREATE POLICY "Users can view own tags" ON public.tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tags" ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tags" ON public.tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tags" ON public.tags FOR DELETE USING (auth.uid() = user_id);

-- Publication tags policies
CREATE POLICY "Users can view own publication tags" ON public.publication_tags FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own publication tags" ON public.publication_tags FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own publication tags" ON public.publication_tags FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.publications WHERE id = publication_id AND user_id = auth.uid()));

-- Vault shares policies
CREATE POLICY "Users can view shares for own vaults" ON public.vault_shares FOR SELECT 
  USING (shared_by = auth.uid() OR shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "Users can share own vaults" ON public.vault_shares FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.vaults WHERE id = vault_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete shares from own vaults" ON public.vault_shares FOR DELETE 
  USING (shared_by = auth.uid());

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vaults_updated_at BEFORE UPDATE ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_publications_updated_at BEFORE UPDATE ON public.publications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

-- Create trigger to automatically create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();