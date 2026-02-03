import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Image, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import Icon3D from '../../components/Icon3D';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../utils/supabase';

export default function ProfileScreen() {
    const { user, logout } = useAuth();
    const [profile, setProfile] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);

    // If we want more details from 'ess_profiles' or similar, fetch here. 
    // For now, user object from AuthContext (users table) has most info.

    useEffect(() => {
        if (user) {
            setProfile(user);
        }
    }, [user]);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        // Reload user from DB to get latest
        if (user?.id) {
            const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
            if (data) setProfile(data);
        }
        setRefreshing(false);
    }, [user]);

    const handleLogout = async () => {
        try {
            await logout();
        } catch (e) {
            console.error(e);
        }
    };

    if (!profile) return <View className="flex-1 bg-white" />;

    return (
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
            <ScrollView
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <View className="px-6 py-6 items-center">
                    <View className="w-24 h-24 bg-blue-100 rounded-full items-center justify-center mb-4 border-4 border-blue-50 relative">
                        {profile.profile_image ? (
                            <Image
                                source={{ uri: profile.profile_image }}
                                className="w-full h-full rounded-full"
                            />
                        ) : (
                            <Icon3D icon="CircleUser" size="lg" variant="blue" />
                        )}
                        <View className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-2 border-white" />
                    </View>

                    <Text className="text-2xl font-black text-slate-900 text-center">{profile.name}</Text>
                    <Text className="text-sm font-bold text-blue-500 uppercase tracking-widest mt-1">{profile.position || 'Employee'}</Text>
                    <View className="bg-slate-100 px-3 py-1 rounded-full mt-3">
                        <Text className="text-xs font-bold text-slate-500">{profile.employee_id}</Text>
                    </View>
                </View>

                <View className="px-6 space-y-4">
                    <View className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                        <InfoRow label="Email" value={profile.email} icon="LayoutDashboard" />
                        {/* Using LayoutDashboard as placeholder for Mail since not imported, or add Mail icon to Icon3D */}
                        <InfoRow label="Phone" value={profile.phone} icon="LayoutDashboard" />
                        <InfoRow label="Date of Birth" value={profile.dob} icon="CalendarDays" />
                        <InfoRow label="Department" value={profile.department || 'General'} icon="LayoutDashboard" />
                        <InfoRow label="Team Lead" value={profile.team_lead || 'N/A'} icon="CircleUser" />
                    </View>

                    <TouchableOpacity
                        onPress={handleLogout}
                        className="bg-rose-50 p-5 rounded-[2rem] border border-rose-100 flex-row items-center justify-center gap-3 mt-4"
                    >
                        <Text className="text-rose-600 font-black uppercase tracking-widest">Logout</Text>
                    </TouchableOpacity>
                </View>

                <View className="h-20" />
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({ label, value, icon }: { label: string, value: string, icon: string }) {
    return (
        <View className="flex-row items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <View>
                <Text className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">{label}</Text>
                <Text className="text-slate-700 font-bold text-base">{value || '--'}</Text>
            </View>
        </View>
    );
}
