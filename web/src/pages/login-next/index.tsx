import SvgIcon from '@/components/svg-icon';
import { useAuth } from '@/hooks/auth-hooks';
import {
  useLogin,
  useLoginChannels,
  useLoginWithChannel,
  useRegister,
} from '@/hooks/use-login-request';
import { useSystemConfig } from '@/hooks/use-system-request';
import { rsaPsw } from '@/utils';
import { redirectToDefaultRoute } from '@/utils/contract-agent-config';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Button, ButtonLoading } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { BlueprintBg } from './bg';
import FlipCard3D, { FlipFaceContext } from './card';
import './index.less';

type LoginFormContentProps = {
  isLoginPage: boolean;
  title: string;
  form: UseFormReturn<any>;
  loading: boolean;
  onCheck: (params: any) => Promise<void>;
  changeTitle: () => void;
  registerEnabled: boolean;
  channels: { channel: string; icon?: string; display_name: string }[];
  handleLoginWithChannel: (channel: string) => void;
  t: ReturnType<typeof useTranslation>['t'];
  disablePasswordLogin?: boolean;
};

function LoginFormContent({
  isLoginPage,
  title,
  form,
  loading,
  onCheck,
  changeTitle,
  registerEnabled,
  channels,
  handleLoginWithChannel,
  t,
  disablePasswordLogin,
}: LoginFormContentProps) {
  const face = useContext(FlipFaceContext);
  const isActiveFace = isLoginPage ? face === 'front' : face === 'back';

  return (
    <div className="login-next-form-wrap">
      <div className="login-next-form-heading">
        <span className="login-next-eyebrow">SECURE ACCESS</span>
        <h2 className="login-next-form-title">
          {title === 'login' ? '登录合同智能筛选平台' : '创建合同筛选账号'}
        </h2>
        <p className="login-next-form-subtitle">
          {title === 'login'
            ? '继续处理合同库、筛选任务与证据结果'
            : '创建账号后开始沉淀合同筛选结果'}
        </p>
      </div>
      <div className="login-next-form-card">
        {!disablePasswordLogin && (
          <Form {...form}>
            <form
              className="flex flex-col gap-8 text-text-primary "
              data-testid="auth-form"
              data-active={isActiveFace ? 'true' : undefined}
              onSubmit={form.handleSubmit(onCheck)}
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('emailLabel')}</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="auth-email"
                        placeholder={t('emailPlaceholder')}
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {title === 'register' && (
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('nicknameLabel')}</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="auth-nickname"
                          placeholder={t('nicknamePlaceholder')}
                          autoComplete="username"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('passwordLabel')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          data-testid="auth-password"
                          type={'password'}
                          placeholder={t('passwordPlaceholder')}
                          autoComplete={
                            title === 'login'
                              ? 'current-password'
                              : 'new-password'
                          }
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {title === 'login' && (
                <FormField
                  control={form.control}
                  name="remember"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex gap-2">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                            }}
                          />
                          <FormLabel
                            className={cn(' hover:text-text-primary', {
                              'text-text-disabled': !field.value,
                              'text-text-primary': field.value,
                            })}
                          >
                            {t('rememberMe')}
                          </FormLabel>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <ButtonLoading
                data-testid="auth-submit"
                type="submit"
                loading={loading}
                className="login-next-submit"
              >
                {title === 'login' ? t('login') : t('continue')}
              </ButtonLoading>
            </form>
          </Form>
        )}

        {title === 'login' && channels && channels.length > 0 && (
          <div className={disablePasswordLogin ? 'py-8' : 'mt-3 border'}>
            {channels.map((item) => (
              <Button
                variant={'transparent'}
                key={item.channel}
                onClick={() => handleLoginWithChannel(item.channel)}
                style={{ marginTop: 10 }}
                className={disablePasswordLogin ? 'w-full' : ''}
              >
                <div className="flex items-center">
                  <SvgIcon
                    name={item.icon || 'sso'}
                    width={20}
                    height={20}
                    style={{ marginRight: 5 }}
                  />
                  Sign in with {item.display_name}
                </div>
              </Button>
            ))}
          </div>
        )}

        {!disablePasswordLogin && title === 'login' && registerEnabled && (
          <div className="mt-10 text-right">
            <p className="text-text-disabled text-sm">
              {t('signInTip')}
              <Button
                data-testid="auth-toggle-register"
                variant={'transparent'}
                onClick={changeTitle}
                className="text-accent-primary/90 hover:text-accent-primary hover:bg-transparent font-medium border-none transition-colors duration-200"
              >
                {t('signUp')}
              </Button>
            </p>
          </div>
        )}
        {!disablePasswordLogin && title === 'register' && (
          <div className="mt-10 text-right">
            <p className="text-text-disabled text-sm">
              {t('signUpTip')}
              <Button
                data-testid="auth-toggle-login"
                variant={'transparent'}
                onClick={changeTitle}
                className="text-accent-primary/90 hover:text-accent-primary hover:bg-transparent font-medium border-none transition-colors duration-200"
              >
                {t('login')}
              </Button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const Login = () => {
  const [title, setTitle] = useState('login');
  const navigate = useNavigate();
  const { login, loading: signLoading } = useLogin();
  const { register, loading: registerLoading } = useRegister();
  const { channels, loading: channelsLoading } = useLoginChannels();
  const { login: loginWithChannel, loading: loginWithChannelLoading } =
    useLoginWithChannel();
  const { t } = useTranslation('translation', { keyPrefix: 'login' });
  const [isLoginPage, setIsLoginPage] = useState(true);

  const loading =
    signLoading ||
    registerLoading ||
    channelsLoading ||
    loginWithChannelLoading;
  const { config } = useSystemConfig();
  const registerEnabled = config?.registerEnabled !== 0;

  const { isLogin } = useAuth();
  useEffect(() => {
    if (isLogin) {
      redirectToDefaultRoute(navigate);
    }
  }, [isLogin, navigate]);

  const handleLoginWithChannel = async (channel: string) => {
    await loginWithChannel(channel);
  };

  const changeTitle = () => {
    setIsLoginPage(title !== 'login');
    if (title === 'login' && !registerEnabled) {
      return;
    }

    setTimeout(() => {
      setTitle(title === 'login' ? 'register' : 'login');
    }, 200);
  };

  const FormSchema = z
    .object({
      nickname: z.string(),
      email: z
        .string()
        .email()
        .min(1, { message: t('emailPlaceholder') }),
      password: z.string().min(1, { message: t('passwordPlaceholder') }),
      remember: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
      if (title === 'register' && !data.nickname) {
        ctx.addIssue({
          path: ['nickname'],
          message: 'nicknamePlaceholder',
          code: z.ZodIssueCode.custom,
        });
      }
    });
  type FormValues = z.infer<typeof FormSchema>;
  const form = useForm<FormValues>({
    defaultValues: {
      nickname: '',
      email: '',
      password: '',
      remember: false,
    },
    resolver: zodResolver(FormSchema),
  });

  const onCheck = async (params: FormValues) => {
    try {
      const rsaPassWord = rsaPsw(params.password) as string;

      if (title === 'login') {
        const code = await login({
          email: `${params.email}`.trim(),
          password: rsaPassWord,
        });
        if (code === 0) {
          redirectToDefaultRoute(navigate);
        }
      } else {
        const code = await register({
          nickname: params.nickname,
          email: params.email,
          password: rsaPassWord,
        });
        if (code === 0) {
          setTitle('login');
        }
      }
    } catch (errorInfo) {
      console.log('Failed:', errorInfo);
    }
  };

  return (
    <section className="login-next-page">
      <BlueprintBg isPaused={loading} />
      <div className="login-next-content">
        <div className="login-next-brand">
          <span className="login-next-kicker">CONTRACT INTELLIGENCE</span>
          <h1>合同智能筛选平台</h1>
          <p>
            用可追溯证据完成合同风险筛选，让合同库、筛选条件与审计结果形成统一工作流。
          </p>
          <div className="login-next-capabilities" aria-label="平台能力">
            <span>自然语言筛选</span>
            <span>合同证据追溯</span>
            <span>风险结果沉淀</span>
          </div>
        </div>

        <div className="login-next-panel">
          <FlipCard3D isLoginPage={isLoginPage}>
            <LoginFormContent
              isLoginPage={isLoginPage}
              title={title}
              form={form}
              loading={loading}
              onCheck={onCheck}
              changeTitle={changeTitle}
              registerEnabled={registerEnabled}
              channels={channels || []}
              handleLoginWithChannel={handleLoginWithChannel}
              t={t}
              disablePasswordLogin={!!config?.disablePasswordLogin}
            />
          </FlipCard3D>
        </div>
      </div>
    </section>
  );
};

export default Login;
